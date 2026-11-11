// 網頁的主程式：大廳、等待、比賽、結束畫面的切換與操作。

import { CTF_CONFIG, type Action, type Direction, type GameEvent, type GameState, type Position } from '../../games/ctf/core/index.ts';
import type { OpponentKind, RoomView, ServerMessage } from '../../server/protocol.ts';
import { createBoard, directionTowards } from './board.ts';
import { connect } from './connection.ts';
import { describeAction, describeEvent, describeResult } from './describe.ts';
import { clearTabToken, loadNickname, loadToken, saveNickname, saveToken } from './storage.ts';

const NICKNAME_MAX = 12;
const LOG_LIMIT = 30;

function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`找不到畫面元素 #${id}`);
  return element;
}

const screens = {
  lobby: $('lobby-screen'),
  waiting: $('waiting-screen'),
  game: $('game-screen'),
};

const nicknameInput = $('nickname-input') as HTMLInputElement;
const roomCodeInput = $('room-code-input') as HTMLInputElement;
const lobbyError = $('lobby-error');
const shootButton = $('shoot-button') as HTMLButtonElement;
const dropButton = $('drop-button') as HTMLButtonElement;
const stayButton = $('stay-button') as HTMLButtonElement;
const rematchButton = $('rematch-button') as HTMLButtonElement;
const timerFill = $('timer-fill');

// ───────── 狀態 ─────────

let room: RoomView | null = null;
/** 收到 room 訊息時的時間，用來推算倒數條 */
let roomReceivedAt = 0;
/** 上一次畫面上的場面，用來畫射擊線 */
let previousGame: GameState | null = null;
let shootMode = false;
let flashIds = new Set<string>();
let logLines: string[] = [];
let connected = false;

// ───────── 連線 ─────────

const connection = connect({
  onOpen: () => {
    connected = true;
    $('connection-banner').hidden = true;
    const saved = loadToken();
    if (saved) connection.send({ type: 'resume', token: saved.token, sameTab: saved.sameTab });
    else showScreen('lobby');
  },
  onMessage: handleServerMessage,
  onClose: () => {
    connected = false;
    $('connection-banner').hidden = false;
  },
});

function handleServerMessage(message: ServerMessage): void {
  switch (message.type) {
    case 'joined':
      saveToken(message.token);
      lobbyError.hidden = true;
      return;
    case 'resumeFailed':
      if (message.reason === 'gone') saveToken(null);
      else clearTabToken();
      room = null;
      showScreen('lobby');
      return;
    case 'leftRoom':
      saveToken(null);
      room = null;
      previousGame = null;
      logLines = [];
      showScreen('lobby');
      if (message.message) showLobbyError(message.message);
      return;
    case 'error':
      if (room) setHint(message.message);
      else showLobbyError(message.message);
      return;
    case 'room':
      onRoomUpdate(message.room, message.events);
      return;
  }
}

function onRoomUpdate(next: RoomView, events: GameEvent[] | undefined): void {
  const before = previousGame;
  room = next;
  roomReceivedAt = performance.now();

  if (next.phase === 'countdown') {
    // 新的一場：清掉上一場的紀錄
    logLines = [];
    shootMode = false;
  }

  if (events && before && next.game) {
    const myId = next.yourCharacterId;
    const lines = events.map((event) => describeEvent(event, myId)).filter((line): line is string => line !== null);
    if (lines.length > 0) {
      logLines.unshift(...lines.reverse().map((line) => `第 ${next.game!.round} 回合：${line}`));
      logLines = logLines.slice(0, LOG_LIMIT);
    }
    board.drawShots(before, events);
    flashIds = new Set(events.flatMap((event) => (event.type === 'damaged' ? [event.characterId] : [])));
    setTimeout(() => {
      flashIds = new Set();
      render();
    }, 500);
    // 新的一回合：射擊模式和提示都重新開始
    shootMode = false;
    setHint('');
  }
  previousGame = next.game;
  render();
}

// ───────── 大廳 ─────────

nicknameInput.value = loadNickname();

function readNickname(): string | null {
  const nickname = nicknameInput.value.trim();
  const length = [...nickname].length;
  if (length < 1 || length > NICKNAME_MAX) {
    showLobbyError(`暱稱要 1 到 ${NICKNAME_MAX} 個字。`);
    return null;
  }
  saveNickname(nickname);
  return nickname;
}

$('create-button').addEventListener('click', () => {
  const nickname = readNickname();
  if (!nickname) return;
  if (!connected) return showLobbyError('還沒連上伺服器，請稍等。');
  const selected = document.querySelector<HTMLInputElement>('input[name="opponent"]:checked');
  const opponent = (selected?.value ?? 'friend') as OpponentKind;
  connection.send({ type: 'createRoom', nickname, opponent });
});

$('join-button').addEventListener('click', joinRoom);
roomCodeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') joinRoom();
});
roomCodeInput.addEventListener('input', () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase();
});

function joinRoom(): void {
  const nickname = readNickname();
  if (!nickname) return;
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length !== 4) return showLobbyError('房號是 4 個英文字母。');
  if (!connected) return showLobbyError('還沒連上伺服器，請稍等。');
  connection.send({ type: 'joinRoom', nickname, roomCode: code });
}

function showLobbyError(message: string): void {
  lobbyError.textContent = message;
  lobbyError.hidden = false;
}

$('cancel-waiting-button').addEventListener('click', () => connection.send({ type: 'leaveRoom' }));

// ───────── 比賽中的操作 ─────────

const board = createBoard($('board'), $('shot-layer') as unknown as SVGSVGElement, onCellClick);

function myCharacter() {
  if (!room?.game) return null;
  return room.game.characters.find((character) => character.id === room!.yourCharacterId) ?? null;
}

function amCarrier(): boolean {
  return room?.game?.flag.status === 'carried' && room.game.flag.carrierId === room.yourCharacterId;
}

/** 現在可以送動作嗎（比賽中、自己在場上） */
function canAct(): boolean {
  return room?.phase === 'playing' && Boolean(myCharacter()?.position);
}

function sendAction(action: Action): void {
  if (!room?.game || !canAct()) return;
  connection.send({ type: 'action', round: room.game.round + 1, action });
  shootMode = false;
  setHint('');
}

function onCellClick(position: Position): void {
  const me = myCharacter();
  if (!canAct() || !me?.position) return;
  const direction = directionTowards(me.position, position);
  if (!direction) return;

  if (shootMode) {
    sendAction({ type: 'shoot', direction });
    return;
  }
  const isNeighbour = Math.abs(me.position.x - position.x) + Math.abs(me.position.y - position.y) === 1;
  if (isNeighbour) sendAction({ type: 'move', direction });
}

shootButton.addEventListener('click', () => {
  if (!canAct()) return;
  if (amCarrier()) return setHint('拿著旗子時不能射擊。');
  shootMode = !shootMode;
  setHint(shootMode ? '點上、下、左、右任一方向的格子來射擊（再按一次「射擊」取消）。' : '');
  render();
});

dropButton.addEventListener('click', () => {
  if (amCarrier()) sendAction({ type: 'dropFlag' });
});

stayButton.addEventListener('click', () => sendAction({ type: 'stay' }));

const KEY_MOVES: Record<string, Direction> = { w: 'up', a: 'left', s: 'down', d: 'right' };
const KEY_SHOTS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (!canAct()) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  const moveDirection = KEY_MOVES[key];
  const shotDirection = KEY_SHOTS[key];
  if (moveDirection) {
    sendAction({ type: 'move', direction: moveDirection });
  } else if (shotDirection) {
    event.preventDefault();
    if (amCarrier()) setHint('拿著旗子時不能射擊。');
    else sendAction({ type: 'shoot', direction: shotDirection });
  } else if (key === 'f') {
    if (amCarrier()) sendAction({ type: 'dropFlag' });
    else setHint('沒有拿旗子，不能放下。');
  } else if (key === ' ') {
    event.preventDefault();
    sendAction({ type: 'stay' });
  }
});

function setHint(text: string): void {
  $('control-hint').textContent = text;
}

// ───────── 結束畫面 ─────────

rematchButton.addEventListener('click', () => connection.send({ type: 'rematch' }));
$('lobby-button').addEventListener('click', () => connection.send({ type: 'leaveRoom' }));

// ───────── 畫面更新 ─────────

function showScreen(name: keyof typeof screens): void {
  for (const [key, element] of Object.entries(screens)) {
    element.hidden = key !== name;
  }
}

function render(): void {
  if (!room) return;
  if (room.phase === 'waiting') {
    showScreen('waiting');
    $('waiting-room-code').textContent = room.roomCode;
    return;
  }
  showScreen('game');
  const game = room.game;
  if (!game) return;

  // 記分板
  const seatA = room.seats.A;
  const seatB = room.seats.B;
  $('name-a').textContent = `${seatA?.nickname ?? ''}${room.yourTeam === 'A' ? '（你）' : ''}${seatA && !seatA.connected ? '（斷線中）' : ''}`;
  $('name-b').textContent = `${seatB?.nickname ?? ''}${room.yourTeam === 'B' ? '（你）' : ''}${seatB && !seatB.connected ? '（斷線中）' : ''}`;
  $('score-a').textContent = `${game.scores.A} 分`;
  $('score-b').textContent = `${game.scores.B} 分`;
  $('knockdowns-a').textContent = `擊倒 ${game.knockdowns.A}`;
  $('knockdowns-b').textContent = `擊倒 ${game.knockdowns.B}`;
  const nextRound = room.phase === 'finished' ? game.round : game.round + 1;
  $('round-label').textContent = game.phase === 'overtime' ? `延長賽 · 第 ${nextRound} 回合` : `第 ${nextRound} / ${CTF_CONFIG.regularMaxRounds} 回合`;
  $('room-label').textContent = `房號 ${room.roomCode}`;

  // 場地
  board.render({
    game,
    myId: room.yourCharacterId,
    highlight: canAct() ? (shootMode ? 'shoot' : 'move') : null,
    flashIds,
  });

  // 倒數
  const countdown = $('countdown-overlay');
  if (room.phase === 'countdown' && room.countdownRemainingMs !== null) {
    const left = room.countdownRemainingMs - (performance.now() - roomReceivedAt);
    countdown.textContent = String(Math.max(1, Math.ceil(left / 1000)));
    countdown.hidden = false;
  } else {
    countdown.hidden = true;
  }

  // 狀態列
  const me = myCharacter();
  const opponentSeat = room.yourTeam === 'A' ? seatB : seatA;
  let status = '';
  if (room.phase === 'countdown') {
    status = '比賽即將開始';
  } else if (room.phase === 'playing' && me && !me.position) {
    status = `你倒地了，${me.respawnCountdown} 回合後在重生點復活`;
  } else if (room.phase === 'playing') {
    const mine = room.yourAction ? `你選了：${describeAction(room.yourAction)}（時間到前可以改）` : '請選擇這回合的動作';
    const theirs = opponentSeat?.isAi ? '' : room.opponentReady ? ' · 對手已選好 ✓' : ' · 對手還在想…';
    status = mine + theirs;
  }
  $('status-line').textContent = status;

  // 按鈕
  const acting = canAct();
  const carrier = amCarrier();
  shootButton.disabled = !acting || carrier;
  shootButton.title = carrier ? '拿著旗子時不能射擊' : '';
  shootButton.textContent = carrier ? '射擊（拿著旗子不能用）' : '射擊';
  shootButton.classList.toggle('active', shootMode);
  dropButton.disabled = !acting || !carrier;
  stayButton.disabled = !acting;

  // 紀錄
  const log = $('event-log');
  log.replaceChildren(
    ...logLines.map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }),
  );

  // 結束畫面
  const panel = $('finished-panel');
  if (room.phase === 'finished' && room.result) {
    const { title, reason } = describeResult(room.result, room.yourTeam);
    $('finished-title').textContent = title;
    $('finished-reason').textContent = `結束原因：${reason}`;
    $('finished-stats').textContent = `分數 ${game.scores.A} : ${game.scores.B} · 擊倒數 ${game.knockdowns.A} : ${game.knockdowns.B}（藍 : 紅）`;
    const mySeat = room.seats[room.yourTeam];
    let rematchText = '';
    if (opponentSeat?.left) rematchText = '對手已經離開房間。';
    else if (mySeat?.wantsRematch) rematchText = '等待對手同意再來一場…';
    else if (opponentSeat?.wantsRematch) rematchText = '對手想再來一場！';
    $('rematch-status').textContent = rematchText;
    rematchButton.disabled = Boolean(opponentSeat?.left) || Boolean(mySeat?.wantsRematch);
    panel.hidden = false;
  } else {
    panel.hidden = true;
  }
}

/** 倒數條：每一格畫面更新一次 */
function animateTimer(): void {
  let ratio = 0;
  if (room?.phase === 'playing' && room.roundRemainingMs !== null) {
    const left = room.roundRemainingMs - (performance.now() - roomReceivedAt);
    ratio = Math.max(0, Math.min(1, left / (CTF_CONFIG.roundSeconds * 1000)));
  }
  timerFill.style.width = `${ratio * 100}%`;
  if (room?.phase === 'countdown' && room.countdownRemainingMs !== null) {
    const left = room.countdownRemainingMs - (performance.now() - roomReceivedAt);
    $('countdown-overlay').textContent = String(Math.max(1, Math.ceil(left / 1000)));
  }
  requestAnimationFrame(animateTimer);
}
requestAnimationFrame(animateTimer);
