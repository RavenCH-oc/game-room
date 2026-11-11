// 房間邏輯（docs/web-v1.md 第 3、4、5、7 節）。
// 這裡不碰網路：誰連進來、收到什麼訊息、要送什麼出去，都透過參數和 send 函式。
// 這樣測試時不用開瀏覽器，也可以用假的計時器跳過等待時間。
// 規則結算一律交給 games/ctf/core/。

import { randomBytes } from 'node:crypto';
import { createFlagRunner } from '../games/ctf/bots/flagRunner.ts';
import { createRandomWalker } from '../games/ctf/bots/randomWalker.ts';
import {
  CTF_CONFIG,
  createInitialState,
  getCharacterView,
  isDirection,
  otherTeam,
  resolveRound,
  type Action,
  type ActionMap,
  type Bot,
  type CtfConfig,
  type GameEvent,
  type GameState,
  type Team,
} from '../games/ctf/core/index.ts';
import { ROOM_CODE_LENGTH, ROOM_CODE_LETTERS, SERVER_CONFIG, type ServerConfig } from './config.ts';
import type {
  ClientMessage,
  MatchResult,
  OpponentKind,
  RoomPhase,
  RoomView,
  SeatView,
  ServerMessage,
} from './protocol.ts';

type Timer = ReturnType<typeof setTimeout>;

/** 一條連線（真實伺服器裡就是一個 WebSocket；測試裡是假的） */
export interface ClientConnection {
  id: string;
  send(message: ServerMessage): void;
}

interface Seat {
  nickname: string;
  /** AI 才有 */
  bot: Bot | null;
  /** 真人才有：重新整理後回到房間用的通行碼 */
  token: string | null;
  /** 真人目前的連線；斷線中是 null */
  connectionId: string | null;
  disconnectTimer: Timer | null;
  wantsRematch: boolean;
  /** 比賽結束後按了「回大廳」或斷線太久 */
  left: boolean;
}

interface Room {
  code: string;
  opponentKind: OpponentKind;
  phase: RoomPhase;
  seats: Record<Team, Seat | null>;
  game: GameState | null;
  /** 這回合真人送出的動作：角色 id → 動作 */
  pendingActions: Map<string, Action>;
  countdownTimer: Timer | null;
  countdownEndsAt: number | null;
  roundTimer: Timer | null;
  roundEndsAt: number | null;
  finishedTimer: Timer | null;
  result: MatchResult | null;
}

interface ConnectionRecord {
  connection: ClientConnection;
  roomCode: string | null;
  team: Team | null;
}

export interface RoomManagerOptions {
  config?: ServerConfig;
  ctfConfig?: CtfConfig;
  /** 產生房號、AI 種子用的亂數（測試可以換掉） */
  random?: () => number;
}

const OPPONENT_KINDS: readonly OpponentKind[] = ['friend', 'aiFlagRunner', 'aiRandomWalker'];
const TEAMS: readonly Team[] = ['A', 'B'];

export class RoomManager {
  private readonly config: ServerConfig;
  private readonly ctfConfig: CtfConfig;
  private readonly random: () => number;
  private readonly rooms = new Map<string, Room>();
  private readonly connections = new Map<string, ConnectionRecord>();
  /** 通行碼 → 哪個房間的哪一隊 */
  private readonly tokens = new Map<string, { roomCode: string; team: Team }>();

  constructor(options: RoomManagerOptions = {}) {
    this.config = options.config ?? SERVER_CONFIG;
    this.ctfConfig = options.ctfConfig ?? CTF_CONFIG;
    this.random = options.random ?? Math.random;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  hasRoom(code: string): boolean {
    return this.rooms.has(code);
  }

  // ───────── 連線進出 ─────────

  addConnection(connection: ClientConnection): void {
    this.connections.set(connection.id, { connection, roomCode: null, team: null });
  }

  /** 連線中斷（關掉分頁、重新整理、網路斷掉） */
  removeConnection(connectionId: string): void {
    const record = this.connections.get(connectionId);
    this.connections.delete(connectionId);
    if (!record?.roomCode || !record.team) return;

    const room = this.rooms.get(record.roomCode);
    const seat = room?.seats[record.team];
    if (!room || !seat || seat.connectionId !== connectionId) return;

    seat.connectionId = null;
    // 斷線中的角色每回合視為「不動」：把他已經選的動作也取消
    const characterId = this.characterIdOf(room, record.team);
    if (characterId) room.pendingActions.delete(characterId);

    const team = record.team;
    seat.disconnectTimer = setTimeout(
      () => this.onDisconnectTimeout(room.code, team),
      this.config.disconnectGraceSeconds * 1000,
    );
    this.broadcast(room);
  }

  /**
   * 收到一則訊息。格式不對、不是這個房間的人、不是自己的角色，一律忽略。
   * 這個函式不會丟出錯誤。
   */
  handleMessage(connectionId: string, raw: unknown): void {
    try {
      const record = this.connections.get(connectionId);
      if (!record) return;
      const message = parseClientMessage(raw);
      if (!message) return;
      this.dispatch(record, message);
    } catch (error) {
      // 保險：就算哪裡寫錯了，也不讓整個伺服器當掉
      console.error('處理訊息時發生錯誤：', error);
    }
  }

  private dispatch(record: ConnectionRecord, message: ClientMessage): void {
    switch (message.type) {
      case 'createRoom':
        return this.createRoom(record, message.nickname, message.opponent);
      case 'joinRoom':
        return this.joinRoom(record, message.nickname, message.roomCode);
      case 'resume':
        return this.resume(record, message.token, message.sameTab);
      case 'action':
        return this.submitAction(record, message.round, message.action);
      case 'rematch':
        return this.requestRematch(record);
      case 'leaveRoom':
        return this.leaveRoom(record);
    }
  }

  // ───────── 大廳：開房、加入、重連 ─────────

  private createRoom(record: ConnectionRecord, nickname: string, opponent: OpponentKind): void {
    if (record.roomCode) return;
    const nicknameError = this.checkNickname(nickname);
    if (nicknameError) return this.sendError(record, nicknameError);
    if (this.rooms.size >= this.config.maxRooms) {
      return this.sendError(record, '目前房間數已經滿了，請稍後再試。');
    }

    const room: Room = {
      code: this.generateRoomCode(),
      opponentKind: opponent,
      phase: 'waiting',
      seats: { A: this.createHumanSeat(nickname.trim(), record), B: null },
      game: null,
      pendingActions: new Map(),
      countdownTimer: null,
      countdownEndsAt: null,
      roundTimer: null,
      roundEndsAt: null,
      finishedTimer: null,
      result: null,
    };
    this.rooms.set(room.code, room);
    this.attach(record, room, 'A');

    if (opponent !== 'friend') {
      // AI 對手一律是 B 隊，跳過等待
      room.seats.B = {
        nickname: opponent === 'aiFlagRunner' ? 'AI：搶旗' : 'AI：亂走',
        bot: opponent === 'aiFlagRunner' ? createFlagRunner(this.ctfConfig) : createRandomWalker(this.randomSeed()),
        token: null,
        connectionId: null,
        disconnectTimer: null,
        wantsRematch: false,
        left: false,
      };
      this.startCountdown(room);
    } else {
      this.broadcast(room);
    }
  }

  private joinRoom(record: ConnectionRecord, nickname: string, rawCode: string): void {
    if (record.roomCode) return;
    const nicknameError = this.checkNickname(nickname);
    if (nicknameError) return this.sendError(record, nicknameError);

    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return this.sendError(record, `找不到房號 ${code || '（空白）'} 的房間，請確認房號。`);
    if (room.seats.B) return this.sendError(record, '這個房間已經滿了。');
    if (room.phase !== 'waiting') return this.sendError(record, '這個房間的比賽已經開始了。');

    room.seats.B = this.createHumanSeat(nickname.trim(), record);
    this.attach(record, room, 'B');
    this.startCountdown(room);
  }

  private resume(record: ConnectionRecord, token: string, sameTab: boolean): void {
    if (record.roomCode) return;
    const entry = this.tokens.get(token);
    const room = entry ? this.rooms.get(entry.roomCode) : undefined;
    const seat = entry && room ? room.seats[entry.team] : null;
    if (!entry || !room || !seat || seat.left || seat.token !== token) {
      record.connection.send({ type: 'resumeFailed', reason: 'gone', message: '原本的房間已經不在了。' });
      return;
    }
    if (seat.connectionId && !sameTab) {
      // 另一個分頁正在用這個位子（兩個分頁共用同一個瀏覽器的通行碼）：不能搶
      record.connection.send({ type: 'resumeFailed', reason: 'inUse', message: '這個位子正在另一個分頁使用中。' });
      return;
    }

    // 同一個分頁重新整理，舊連線還沒斷乾淨：讓新的接手
    if (seat.connectionId) {
      const old = this.connections.get(seat.connectionId);
      if (old) {
        old.roomCode = null;
        old.team = null;
        old.connection.send({ type: 'leftRoom', message: '你在另一個分頁回到了這個房間。' });
      }
    }
    if (seat.disconnectTimer) {
      clearTimeout(seat.disconnectTimer);
      seat.disconnectTimer = null;
    }
    seat.connectionId = record.connection.id;
    record.roomCode = room.code;
    record.team = entry.team;
    record.connection.send({ type: 'joined', token, roomCode: room.code, team: entry.team });
    this.broadcast(room);
  }

  // ───────── 比賽中 ─────────

  private submitAction(record: ConnectionRecord, round: number, action: Action): void {
    const room = this.roomOf(record);
    if (!room || !record.team || room.phase !== 'playing' || !room.game) return;
    if (round !== room.game.round + 1) return; // 不是這一回合的動作

    const characterId = this.characterIdOf(room, record.team);
    const character = room.game.characters.find((candidate) => candidate.id === characterId);
    if (!characterId || !character?.position) return; // 倒地離場中不用送

    // 結算前可以改，以最後一次為準
    room.pendingActions.set(characterId, action);

    if (this.allHumansInPlaySubmitted(room)) {
      this.resolveCurrentRound(room);
    } else {
      this.broadcast(room);
    }
  }

  /** 所有「在場」的真人角色都送出了嗎？（場上沒有在場的真人時回傳 false，等時間到） */
  private allHumansInPlaySubmitted(room: Room): boolean {
    if (!room.game) return false;
    let humansInPlay = 0;
    for (const team of TEAMS) {
      const seat = room.seats[team];
      if (!seat || seat.bot) continue;
      const characterId = this.characterIdOf(room, team);
      const character = room.game.characters.find((candidate) => candidate.id === characterId);
      if (!character?.position) continue;
      humansInPlay += 1;
      if (!room.pendingActions.has(character.id)) return false;
    }
    return humansInPlay > 0;
  }

  private startCountdown(room: Room): void {
    this.clearRoundTimer(room);
    room.phase = 'countdown';
    room.game = createInitialState(this.ctfConfig);
    room.pendingActions.clear();
    room.result = null;
    for (const team of TEAMS) {
      const seat = room.seats[team];
      if (seat) seat.wantsRematch = false;
    }
    if (room.finishedTimer) {
      clearTimeout(room.finishedTimer);
      room.finishedTimer = null;
    }
    const ms = this.config.startCountdownSeconds * 1000;
    room.countdownEndsAt = Date.now() + ms;
    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      room.countdownEndsAt = null;
      room.phase = 'playing';
      this.startRound(room);
    }, ms);
    this.broadcast(room);
  }

  private startRound(room: Room, events?: GameEvent[]): void {
    room.pendingActions.clear();
    const ms = this.ctfConfig.roundSeconds * 1000;
    room.roundEndsAt = Date.now() + ms;
    room.roundTimer = setTimeout(() => {
      room.roundTimer = null;
      this.resolveCurrentRound(room);
    }, ms);
    this.broadcast(room, events);
  }

  private resolveCurrentRound(room: Room): void {
    if (room.phase !== 'playing' || !room.game) return;
    this.clearRoundTimer(room);

    const actions: ActionMap = {};
    for (const team of TEAMS) {
      const seat = room.seats[team];
      const characterId = this.characterIdOf(room, team);
      if (!seat || !characterId) continue;
      if (seat.bot) {
        const character = room.game.characters.find((candidate) => candidate.id === characterId);
        // AI 的動作在結算時才呼叫腳本取得
        if (character?.position) actions[characterId] = seat.bot(getCharacterView(room.game, characterId));
      } else {
        // 沒送出的不放進去，核心會當作「不動」
        actions[characterId] = room.pendingActions.get(characterId);
      }
    }

    const { state, events } = resolveRound(room.game, actions, this.ctfConfig);
    room.game = state;

    if (state.result) {
      this.finish(room, state.result, events);
    } else {
      this.startRound(room, events);
    }
  }

  private finish(room: Room, result: MatchResult, events?: GameEvent[]): void {
    this.clearRoundTimer(room);
    if (room.countdownTimer) {
      clearTimeout(room.countdownTimer);
      room.countdownTimer = null;
      room.countdownEndsAt = null;
    }
    room.phase = 'finished';
    room.result = result;
    room.pendingActions.clear();
    this.restartFinishedTimer(room);
    this.broadcast(room, events);
  }

  // ───────── 結束後：再來一場、回大廳 ─────────

  private requestRematch(record: ConnectionRecord): void {
    const room = this.roomOf(record);
    if (!room || !record.team || room.phase !== 'finished') return;
    const seat = room.seats[record.team];
    const opponent = room.seats[otherTeam(record.team)];
    if (!seat || !opponent) return;
    this.restartFinishedTimer(room);

    if (opponent.left) {
      this.sendError(record, '對手已經離開房間，沒辦法再來一場。');
      return;
    }
    seat.wantsRematch = true;
    // 對 AI：按了就重新開始；真人對戰：兩邊都按才重新開始
    if (opponent.bot || opponent.wantsRematch) {
      this.startCountdown(room);
    } else {
      this.broadcast(room);
    }
  }

  private leaveRoom(record: ConnectionRecord): void {
    const room = this.roomOf(record);
    if (!room || !record.team) return;
    // 比賽進行中沒有離開按鈕，忽略
    if (room.phase === 'countdown' || room.phase === 'playing') return;

    const team = record.team;
    record.roomCode = null;
    record.team = null;
    record.connection.send({ type: 'leftRoom', message: null });

    if (room.phase === 'waiting') {
      // 開房的人在等待時離開：房間刪除
      this.deleteRoom(room, null);
      return;
    }
    this.markSeatLeft(room, team);
    this.restartFinishedTimer(room);
    if (!this.deleteRoomIfEmpty(room)) this.broadcast(room);
  }

  // ───────── 斷線 ─────────

  private onDisconnectTimeout(roomCode: string, team: Team): void {
    const room = this.rooms.get(roomCode);
    const seat = room?.seats[team];
    if (!room || !seat || seat.connectionId) return;
    seat.disconnectTimer = null;

    if (room.phase === 'waiting') {
      this.deleteRoom(room, null);
      return;
    }
    if (room.phase === 'finished') {
      this.markSeatLeft(room, team);
      if (!this.deleteRoomIfEmpty(room)) this.broadcast(room);
      return;
    }

    // 倒數或比賽中：超過時間沒回來，對手獲勝（伺服器層的判定）
    this.markSeatLeft(room, team);
    const opponent = room.seats[otherTeam(team)];
    if (opponent && !opponent.bot && opponent.connectionId) {
      this.finish(room, { winner: otherTeam(team), reason: 'opponentLeft' });
    } else {
      // 對手是 AI，或另一位真人也不在：兩邊都離開了，房間刪除
      this.deleteRoom(room, null);
    }
  }

  // ───────── 小工具 ─────────

  private markSeatLeft(room: Room, team: Team): void {
    const seat = room.seats[team];
    if (!seat) return;
    seat.left = true;
    seat.wantsRematch = false;
    seat.connectionId = null;
    if (seat.disconnectTimer) clearTimeout(seat.disconnectTimer);
    seat.disconnectTimer = null;
    if (seat.token) this.tokens.delete(seat.token);
  }

  /** 房間裡沒有真人了就刪除，回傳是否刪除 */
  private deleteRoomIfEmpty(room: Room): boolean {
    const humansRemaining = TEAMS.some((team) => {
      const seat = room.seats[team];
      return seat && !seat.bot && !seat.left;
    });
    if (humansRemaining) return false;
    this.deleteRoom(room, null);
    return true;
  }

  private deleteRoom(room: Room, message: string | null): void {
    this.clearRoundTimer(room);
    if (room.countdownTimer) clearTimeout(room.countdownTimer);
    if (room.finishedTimer) clearTimeout(room.finishedTimer);
    for (const team of TEAMS) {
      const seat = room.seats[team];
      if (!seat) continue;
      if (seat.disconnectTimer) clearTimeout(seat.disconnectTimer);
      if (seat.token) this.tokens.delete(seat.token);
      const record = seat.connectionId ? this.connections.get(seat.connectionId) : undefined;
      if (record && record.roomCode === room.code) {
        record.roomCode = null;
        record.team = null;
        record.connection.send({ type: 'leftRoom', message });
      }
    }
    this.rooms.delete(room.code);
  }

  private restartFinishedTimer(room: Room): void {
    if (room.finishedTimer) clearTimeout(room.finishedTimer);
    room.finishedTimer = setTimeout(
      () => this.deleteRoom(room, '比賽結束後太久沒有動作，房間已關閉。'),
      this.config.finishedRoomTtlMinutes * 60 * 1000,
    );
  }

  private clearRoundTimer(room: Room): void {
    if (room.roundTimer) clearTimeout(room.roundTimer);
    room.roundTimer = null;
    room.roundEndsAt = null;
  }

  private createHumanSeat(nickname: string, record: ConnectionRecord): Seat {
    return {
      nickname,
      bot: null,
      token: randomBytes(16).toString('hex'),
      connectionId: record.connection.id,
      disconnectTimer: null,
      wantsRematch: false,
      left: false,
    };
  }

  private attach(record: ConnectionRecord, room: Room, team: Team): void {
    const seat = room.seats[team]!;
    record.roomCode = room.code;
    record.team = team;
    this.tokens.set(seat.token!, { roomCode: room.code, team });
    record.connection.send({ type: 'joined', token: seat.token!, roomCode: room.code, team });
  }

  private roomOf(record: ConnectionRecord): Room | undefined {
    return record.roomCode ? this.rooms.get(record.roomCode) : undefined;
  }

  private characterIdOf(room: Room, team: Team): string | null {
    const state = room.game ?? createInitialState(this.ctfConfig);
    return state.characters.find((character) => character.team === team)?.id ?? null;
  }

  private checkNickname(nickname: string): string | null {
    const length = [...nickname.trim()].length;
    if (length < this.config.nicknameMinLength || length > this.config.nicknameMaxLength) {
      return `暱稱要 ${this.config.nicknameMinLength} 到 ${this.config.nicknameMaxLength} 個字。`;
    }
    return null;
  }

  private generateRoomCode(): string {
    for (;;) {
      let code = '';
      for (let index = 0; index < ROOM_CODE_LENGTH; index++) {
        code += ROOM_CODE_LETTERS[Math.floor(this.random() * ROOM_CODE_LETTERS.length)] ?? 'A';
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  private randomSeed(): number {
    return Math.floor(this.random() * 2 ** 32);
  }

  private sendError(record: ConnectionRecord, message: string): void {
    record.connection.send({ type: 'error', message });
  }

  /** 送給房間裡每位連線中的真人，各自只看得到自己的動作 */
  private broadcast(room: Room, events?: GameEvent[]): void {
    for (const team of TEAMS) {
      const seat = room.seats[team];
      if (!seat?.connectionId) continue;
      const record = this.connections.get(seat.connectionId);
      if (!record || record.roomCode !== room.code) continue;
      const message: ServerMessage = { type: 'room', room: this.buildView(room, team) };
      if (events) message.events = events;
      record.connection.send(message);
    }
  }

  private buildView(room: Room, team: Team): RoomView {
    const now = Date.now();
    const yourCharacterId = this.characterIdOf(room, team)!;
    const opponentCharacterId = this.characterIdOf(room, otherTeam(team));
    const seatView = (seat: Seat | null): SeatView | null =>
      seat && {
        nickname: seat.nickname,
        isAi: seat.bot !== null,
        connected: seat.bot !== null || seat.connectionId !== null,
        wantsRematch: seat.wantsRematch,
        left: seat.left,
      };
    return {
      roomCode: room.code,
      phase: room.phase,
      opponentKind: room.opponentKind,
      yourTeam: team,
      yourCharacterId,
      seats: { A: seatView(room.seats.A), B: seatView(room.seats.B) },
      countdownRemainingMs: room.countdownEndsAt === null ? null : Math.max(0, room.countdownEndsAt - now),
      roundRemainingMs: room.roundEndsAt === null ? null : Math.max(0, room.roundEndsAt - now),
      game: room.game,
      yourAction: room.pendingActions.get(yourCharacterId) ?? null,
      opponentReady: opponentCharacterId !== null && room.pendingActions.has(opponentCharacterId),
      result: room.result,
    };
  }
}

// ───────── 訊息格式檢查 ─────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAction(value: unknown): Action | null {
  if (!isObject(value)) return null;
  switch (value.type) {
    case 'stay':
      return { type: 'stay' };
    case 'dropFlag':
      return { type: 'dropFlag' };
    case 'move':
    case 'shoot':
      return isDirection(value.direction) ? { type: value.type, direction: value.direction } : null;
    default:
      return null;
  }
}

/** 把收到的原始資料轉成訊息；格式不對回傳 null */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 10_000) return null;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isObject(data)) return null;

  switch (data.type) {
    case 'createRoom':
      if (typeof data.nickname !== 'string') return null;
      if (!OPPONENT_KINDS.includes(data.opponent as OpponentKind)) return null;
      return { type: 'createRoom', nickname: data.nickname, opponent: data.opponent as OpponentKind };
    case 'joinRoom':
      if (typeof data.nickname !== 'string' || typeof data.roomCode !== 'string') return null;
      return { type: 'joinRoom', nickname: data.nickname, roomCode: data.roomCode };
    case 'resume':
      if (typeof data.token !== 'string') return null;
      return { type: 'resume', token: data.token, sameTab: data.sameTab === true };
    case 'action': {
      const action = parseAction(data.action);
      if (!action || typeof data.round !== 'number' || !Number.isInteger(data.round)) return null;
      return { type: 'action', round: data.round, action };
    }
    case 'rematch':
      return { type: 'rematch' };
    case 'leaveRoom':
      return { type: 'leaveRoom' };
    default:
      return null;
  }
}
