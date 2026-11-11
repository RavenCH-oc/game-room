// 房間邏輯的測試（docs/web-v1.md 第 10 節）。
// 不開瀏覽器、不真的等：用假的連線和 Vitest 的假計時器。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CTF_CONFIG, type CtfConfig } from '../../games/ctf/core/index.ts';
import { SERVER_CONFIG } from '../config.ts';
import type { ClientMessage, RoomView, ServerMessage } from '../protocol.ts';
import { RoomManager } from '../roomManager.ts';

const ROUND_MS = CTF_CONFIG.roundSeconds * 1000;
const COUNTDOWN_MS = SERVER_CONFIG.startCountdownSeconds * 1000;
const GRACE_MS = SERVER_CONFIG.disconnectGraceSeconds * 1000;

let connectionCounter = 0;

/** 假的瀏覽器：記下伺服器送來的所有訊息 */
function fakeClient(manager: RoomManager) {
  const id = `conn-${++connectionCounter}`;
  const messages: ServerMessage[] = [];
  manager.addConnection({ id, send: (message) => messages.push(structuredClone(message)) });
  return {
    id,
    messages,
    send(message: ClientMessage | unknown) {
      manager.handleMessage(id, typeof message === 'string' ? message : JSON.stringify(message));
    },
    disconnect() {
      manager.removeConnection(id);
    },
    lastRoom(): RoomView {
      const found = [...messages].reverse().find((message) => message.type === 'room');
      if (!found || found.type !== 'room') throw new Error('還沒收到房間資料');
      return found.room;
    },
    lastOfType<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
      return [...messages].reverse().find((message) => message.type === type) as
        | Extract<ServerMessage, { type: T }>
        | undefined;
    },
  };
}
type FakeClient = ReturnType<typeof fakeClient>;

/** 開一間「等朋友」的房，再讓另一人加入，回傳兩個人 */
function startFriendMatch(manager: RoomManager): { a: FakeClient; b: FakeClient; code: string } {
  const a = fakeClient(manager);
  a.send({ type: 'createRoom', nickname: '小明', opponent: 'friend' });
  const code = a.lastRoom().roomCode;
  const b = fakeClient(manager);
  b.send({ type: 'joinRoom', nickname: '小華', roomCode: code });
  return { a, b, code };
}

/** 兩邊到齊並等倒數結束，進入比賽 */
function startPlaying(manager: RoomManager) {
  const players = startFriendMatch(manager);
  vi.advanceTimersByTime(COUNTDOWN_MS);
  return players;
}

function actionFor(client: FakeClient, action: unknown) {
  const round = client.lastRoom().game!.round + 1;
  client.send({ type: 'action', round, action });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('第 3 節：開房與加入', () => {
  it('開房：拿到 4 碼房號（大寫、沒有 I 和 O），開房的人是 A 隊，等待朋友', () => {
    const manager = new RoomManager();
    const a = fakeClient(manager);
    a.send({ type: 'createRoom', nickname: '小明', opponent: 'friend' });

    const joined = a.lastOfType('joined');
    expect(joined?.team).toBe('A');
    expect(joined?.roomCode).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(a.lastRoom()).toMatchObject({ phase: 'waiting', yourTeam: 'A', roomCode: joined?.roomCode });
  });

  it('加入：加入的人是 B 隊，雙方都收到房間資料', () => {
    const manager = new RoomManager();
    const { a, b } = startFriendMatch(manager);
    expect(b.lastOfType('joined')?.team).toBe('B');
    expect(a.lastRoom().seats.B?.nickname).toBe('小華');
    expect(b.lastRoom().seats.A?.nickname).toBe('小明');
  });

  it('房號小寫也能加入', () => {
    const manager = new RoomManager();
    const a = fakeClient(manager);
    a.send({ type: 'createRoom', nickname: '小明', opponent: 'friend' });
    const b = fakeClient(manager);
    b.send({ type: 'joinRoom', nickname: '小華', roomCode: a.lastRoom().roomCode.toLowerCase() });
    expect(b.lastOfType('joined')?.team).toBe('B');
  });

  it('房號不存在：顯示錯誤，留在大廳', () => {
    const manager = new RoomManager();
    const b = fakeClient(manager);
    b.send({ type: 'joinRoom', nickname: '小華', roomCode: 'ZZZZ' });
    expect(b.lastOfType('error')?.message).toContain('找不到');
    expect(b.lastOfType('joined')).toBeUndefined();
  });

  it('房間已滿：第三個人加入顯示錯誤', () => {
    const manager = new RoomManager();
    const { code } = startFriendMatch(manager);
    const c = fakeClient(manager);
    c.send({ type: 'joinRoom', nickname: '小美', roomCode: code });
    expect(c.lastOfType('error')?.message).toContain('滿');
    expect(c.lastOfType('joined')).toBeUndefined();
  });

  it('AI 房間不能再加入（AI 已經佔了 B 隊）', () => {
    const manager = new RoomManager();
    const a = fakeClient(manager);
    a.send({ type: 'createRoom', nickname: '小明', opponent: 'aiFlagRunner' });
    const c = fakeClient(manager);
    c.send({ type: 'joinRoom', nickname: '小美', roomCode: a.lastRoom().roomCode });
    expect(c.lastOfType('error')?.message).toContain('滿');
  });

  it('暱稱要 1 到 12 個字', () => {
    const manager = new RoomManager();
    const a = fakeClient(manager);
    a.send({ type: 'createRoom', nickname: '   ', opponent: 'friend' });
    expect(a.lastOfType('error')?.message).toContain('暱稱');
    a.send({ type: 'createRoom', nickname: '一二三四五六七八九十一二三', opponent: 'friend' });
    expect(a.lastOfType('error')?.message).toContain('暱稱');
    a.send({ type: 'createRoom', nickname: '一二三四五六七八九十一二', opponent: 'friend' });
    expect(a.lastOfType('joined')).toBeDefined();
  });

  it('同時房間數上限 50', () => {
    const manager = new RoomManager();
    for (let index = 0; index < SERVER_CONFIG.maxRooms; index++) {
      fakeClient(manager).send({ type: 'createRoom', nickname: `玩家${index}`, opponent: 'friend' });
    }
    expect(manager.roomCount).toBe(50);
    const late = fakeClient(manager);
    late.send({ type: 'createRoom', nickname: '晚到', opponent: 'friend' });
    expect(late.lastOfType('error')).toBeDefined();
    expect(manager.roomCount).toBe(50);
  });
});

describe('第 4 節：房間流程', () => {
  it('兩邊到齊才開始：只有開房的人時一直等待', () => {
    const manager = new RoomManager();
    const a = fakeClient(manager);
    a.send({ type: 'createRoom', nickname: '小明', opponent: 'friend' });
    vi.advanceTimersByTime(60_000);
    expect(a.lastRoom().phase).toBe('waiting');
  });

  it('兩邊到齊後倒數 3 秒開始', () => {
    const manager = new RoomManager();
    const { a, b } = startFriendMatch(manager);
    expect(a.lastRoom().phase).toBe('countdown');
    vi.advanceTimersByTime(COUNTDOWN_MS - 1);
    expect(a.lastRoom().phase).toBe('countdown');
    vi.advanceTimersByTime(1);
    expect(a.lastRoom().phase).toBe('playing');
    expect(b.lastRoom().phase).toBe('playing');
  });

  it('對 AI 直接開始：跳過等待，AI 是 B 隊', () => {
    const manager = new RoomManager();
    const a = fakeClient(manager);
    a.send({ type: 'createRoom', nickname: '小明', opponent: 'aiRandomWalker' });
    const room = a.lastRoom();
    expect(room.phase).toBe('countdown');
    expect(room.seats.B).toMatchObject({ isAi: true });
    vi.advanceTimersByTime(COUNTDOWN_MS);
    expect(a.lastRoom().phase).toBe('playing');
  });

  it('對 AI：AI 每回合由伺服器呼叫腳本出手', () => {
    const manager = new RoomManager();
    const a = fakeClient(manager);
    a.send({ type: 'createRoom', nickname: '小明', opponent: 'aiFlagRunner' });
    vi.advanceTimersByTime(COUNTDOWN_MS);
    actionFor(a, { type: 'stay' }); // 唯一的真人送出 → 立刻結算
    const room = a.lastRoom();
    expect(room.game!.round).toBe(1);
    // 搶旗 AI 從 (8, 4) 往旗子走了一格
    expect(room.game!.characters.find((character) => character.team === 'B')!.position).toEqual({ x: 7, y: 4 });
  });

  it('等待中按「取消」：房間刪除', () => {
    const manager = new RoomManager();
    const a = fakeClient(manager);
    a.send({ type: 'createRoom', nickname: '小明', opponent: 'friend' });
    a.send({ type: 'leaveRoom' });
    expect(manager.roomCount).toBe(0);
    expect(a.lastOfType('leftRoom')).toBeDefined();
  });
});

describe('第 5 節：比賽中的回合', () => {
  it('兩邊都送出就立刻結算，不用等時間到', () => {
    const manager = new RoomManager();
    const { a, b } = startPlaying(manager);
    actionFor(a, { type: 'move', direction: 'right' });
    expect(a.lastRoom().game!.round).toBe(0);
    actionFor(b, { type: 'move', direction: 'left' });
    const room = a.lastRoom();
    expect(room.game!.round).toBe(1);
    expect(room.game!.characters[0]!.position).toEqual({ x: 1, y: 4 });
    expect(room.game!.characters[1]!.position).toEqual({ x: 7, y: 4 });
    // 結算後兩邊都收到事件清單
    expect(a.lastOfType('room')?.events).toBeDefined();
    expect(b.lastOfType('room')?.events).toBeDefined();
  });

  it('只有一邊送出：要等到時間到才結算', () => {
    const manager = new RoomManager();
    const { a } = startPlaying(manager);
    actionFor(a, { type: 'move', direction: 'right' });
    vi.advanceTimersByTime(ROUND_MS - 1);
    expect(a.lastRoom().game!.round).toBe(0);
    vi.advanceTimersByTime(1);
    expect(a.lastRoom().game!.round).toBe(1);
  });

  it('沒送出的視為不動', () => {
    const manager = new RoomManager();
    const { a } = startPlaying(manager);
    actionFor(a, { type: 'move', direction: 'right' });
    vi.advanceTimersByTime(ROUND_MS);
    const game = a.lastRoom().game!;
    expect(game.characters[0]!.position).toEqual({ x: 1, y: 4 });
    expect(game.characters[1]!.position).toEqual({ x: 8, y: 4 });
  });

  it('時間到兩邊都沒送：兩邊都不動，進入下一回合', () => {
    const manager = new RoomManager();
    const { a } = startPlaying(manager);
    vi.advanceTimersByTime(ROUND_MS * 3);
    expect(a.lastRoom().game!.round).toBe(3);
    expect(a.lastRoom().game!.characters[0]!.position).toEqual({ x: 0, y: 4 });
  });

  it('結算前可以改動作，以最後一次為準', () => {
    const manager = new RoomManager();
    const { a, b } = startPlaying(manager);
    actionFor(a, { type: 'move', direction: 'up' });
    actionFor(a, { type: 'move', direction: 'right' });
    expect(a.lastRoom().yourAction).toEqual({ type: 'move', direction: 'right' });
    actionFor(b, { type: 'stay' });
    expect(a.lastRoom().game!.characters[0]!.position).toEqual({ x: 1, y: 4 });
  });

  it('倒地離場中的玩家不用送出也會結算', () => {
    // 為了快速做出「有人倒地」的場面：兩個重生點靠在一起、生命值 1
    const ctfConfig: CtfConfig = {
      ...CTF_CONFIG,
      maxHp: 1,
      spawnPoints: { A: { x: 3, y: 0 }, B: { x: 4, y: 0 } },
      flagStart: { x: 4, y: 8 },
    };
    const manager = new RoomManager({ ctfConfig });
    const { a, b } = startPlaying(manager);
    actionFor(a, { type: 'shoot', direction: 'right' });
    actionFor(b, { type: 'stay' });
    expect(a.lastRoom().game!.characters[1]!.position).toBeNull(); // B 倒地

    // B 倒地中：只要 A 送出就立刻結算，不用等 B
    actionFor(a, { type: 'stay' });
    expect(a.lastRoom().game!.round).toBe(2);

    // B 倒地中送的動作會被忽略
    b.send({ type: 'action', round: 3, action: { type: 'shoot', direction: 'left' } });
    expect(a.lastRoom().opponentReady).toBe(false);
  });

  it('送給某一邊的資料裡不包含對手還沒結算的動作', () => {
    const manager = new RoomManager();
    const { a, b } = startPlaying(manager);
    const before = b.messages.length;
    actionFor(a, { type: 'shoot', direction: 'down' });

    const sentToB = b.messages.slice(before);
    expect(sentToB.length).toBeGreaterThan(0);
    for (const message of sentToB) {
      const text = JSON.stringify(message);
      expect(text).not.toContain('shoot');
      expect(text).not.toContain('"direction"');
    }
    // 只會知道「對手已選好」
    expect(b.lastRoom().opponentReady).toBe(true);
    expect(b.lastRoom().yourAction).toBeNull();
  });

  it('不是這一回合的動作會被忽略', () => {
    const manager = new RoomManager();
    const { a } = startPlaying(manager);
    a.send({ type: 'action', round: 5, action: { type: 'move', direction: 'right' } });
    expect(a.lastRoom().yourAction).toBeNull();
  });

  it('比賽結束時顯示結果（第 6 節的結束原因）', () => {
    // 回合上限縮短成 1 + 1，快速打到「延長賽平手」
    const ctfConfig: CtfConfig = { ...CTF_CONFIG, regularMaxRounds: 1, overtimeMaxRounds: 1 };
    const manager = new RoomManager({ ctfConfig });
    const { a } = startPlaying(manager);
    vi.advanceTimersByTime(ROUND_MS * 2);
    expect(a.lastRoom()).toMatchObject({ phase: 'finished', result: { winner: null, reason: 'draw' } });
  });
});

describe('第 5 節：亂七八糟的訊息', () => {
  it('格式不對的訊息一律忽略，伺服器不會當掉', () => {
    const manager = new RoomManager();
    const { a, b } = startPlaying(manager);
    const garbage: unknown[] = [
      'not json',
      '',
      'null',
      '123',
      '[]',
      '{}',
      '{"type":"action"}',
      '{"type":"action","round":"1","action":{"type":"move","direction":"right"}}',
      '{"type":"action","round":1,"action":{"type":"move","direction":"north"}}',
      '{"type":"action","round":1,"action":{"type":"teleport"}}',
      '{"type":"action","round":1,"action":null}',
      '{"type":"createRoom","nickname":5,"opponent":"friend"}',
      '{"type":"createRoom","nickname":"x","opponent":"boss"}',
      '{"type":"joinRoom","nickname":"x","roomCode":null}',
      '{"type":"resume","token":{"a":1}}',
      '{"__proto__":{"polluted":true},"type":"rematch"}',
      'x'.repeat(50_000),
    ];
    for (const message of garbage) {
      expect(() => a.send(message)).not.toThrow();
      expect(() => manager.handleMessage(a.id, message)).not.toThrow();
    }
    expect(() => manager.handleMessage(a.id, undefined)).not.toThrow();
    expect(() => manager.handleMessage(a.id, { toString: null })).not.toThrow();
    // 不存在的連線送來的訊息
    expect(() => manager.handleMessage('nobody', '{"type":"rematch"}')).not.toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    // 房間照常運作
    actionFor(a, { type: 'stay' });
    actionFor(b, { type: 'stay' });
    expect(a.lastRoom().game!.round).toBe(1);
  });

  it('不在房間裡的人送動作：忽略', () => {
    const manager = new RoomManager();
    const { a } = startPlaying(manager);
    const stranger = fakeClient(manager);
    stranger.send({ type: 'action', round: 1, action: { type: 'move', direction: 'right' } });
    expect(stranger.messages).toEqual([]);
    expect(a.lastRoom().opponentReady).toBe(false);
  });
});

describe('第 7 節：斷線', () => {
  it('斷線後 30 秒內用通行碼重連，回到原本的角色', () => {
    const manager = new RoomManager();
    const { a, b } = startPlaying(manager);
    const token = a.lastOfType('joined')!.token;
    a.disconnect();
    expect(b.lastRoom().seats.A?.connected).toBe(false);

    vi.advanceTimersByTime(GRACE_MS - 1000);
    const again = fakeClient(manager);
    again.send({ type: 'resume', token, sameTab: true });
    expect(again.lastOfType('joined')).toMatchObject({ team: 'A', token });
    expect(again.lastRoom()).toMatchObject({ yourTeam: 'A', phase: 'playing' });
    expect(b.lastRoom().seats.A?.connected).toBe(true);

    // 過了原本的 30 秒期限，也不會判輸
    vi.advanceTimersByTime(GRACE_MS);
    expect(again.lastRoom().result).toBeNull();
  });

  it('斷線期間角色每回合視為不動，比賽照常進行', () => {
    const manager = new RoomManager();
    const { a, b } = startPlaying(manager);
    actionFor(a, { type: 'move', direction: 'right' });
    a.disconnect();
    actionFor(b, { type: 'stay' });
    expect(b.lastRoom().game!.round).toBe(0); // 斷線的 A 還在場，要等時間到
    vi.advanceTimersByTime(ROUND_MS);
    expect(b.lastRoom().game!.round).toBe(1);
    expect(b.lastRoom().game!.characters[0]!.position).toEqual({ x: 0, y: 4 }); // 斷線前選的動作也取消
  });

  it('超過 30 秒沒回來：比賽結束，對手獲勝（對手離開）', () => {
    const manager = new RoomManager();
    const { a, b } = startPlaying(manager);
    const token = a.lastOfType('joined')!.token;
    a.disconnect();
    vi.advanceTimersByTime(GRACE_MS);
    expect(b.lastRoom()).toMatchObject({ phase: 'finished', result: { winner: 'B', reason: 'opponentLeft' } });

    // 之後再用通行碼也回不去
    const late = fakeClient(manager);
    late.send({ type: 'resume', token, sameTab: true });
    expect(late.lastOfType('resumeFailed')?.reason).toBe('gone');
  });

  it('兩邊都離開：房間刪除', () => {
    const manager = new RoomManager();
    const { a, b } = startPlaying(manager);
    a.disconnect();
    b.disconnect();
    vi.advanceTimersByTime(GRACE_MS);
    expect(manager.roomCount).toBe(0);
  });

  it('對 AI 時斷線超過 30 秒：房間刪除', () => {
    const manager = new RoomManager();
    const a = fakeClient(manager);
    a.send({ type: 'createRoom', nickname: '小明', opponent: 'aiFlagRunner' });
    vi.advanceTimersByTime(COUNTDOWN_MS);
    a.disconnect();
    vi.advanceTimersByTime(GRACE_MS);
    expect(manager.roomCount).toBe(0);
  });

  it('同一個分頁重新整理時舊連線還沒斷：新的連線接手，舊的回大廳', () => {
    const manager = new RoomManager();
    const { a } = startPlaying(manager);
    const token = a.lastOfType('joined')!.token;
    const refreshed = fakeClient(manager);
    refreshed.send({ type: 'resume', token, sameTab: true });
    expect(refreshed.lastRoom().yourTeam).toBe('A');
    expect(a.lastOfType('leftRoom')).toBeDefined();
  });

  it('另一個分頁讀到共用的通行碼：位子有人連線中就不能搶', () => {
    const manager = new RoomManager();
    const { a } = startPlaying(manager);
    const token = a.lastOfType('joined')!.token;
    const otherTab = fakeClient(manager);
    otherTab.send({ type: 'resume', token, sameTab: false });
    expect(otherTab.lastOfType('resumeFailed')?.reason).toBe('inUse');
    expect(a.lastOfType('leftRoom')).toBeUndefined();
    expect(a.lastRoom().seats.A?.connected).toBe(true);
  });

  it('把分頁關掉再打開（用共用的通行碼）：位子斷線中就可以回去', () => {
    const manager = new RoomManager();
    const { a } = startPlaying(manager);
    const token = a.lastOfType('joined')!.token;
    a.disconnect();
    const reopened = fakeClient(manager);
    reopened.send({ type: 'resume', token, sameTab: false });
    expect(reopened.lastOfType('joined')?.team).toBe('A');
  });
});

describe('第 4 節：結束後', () => {
  // 回合上限縮短，兩回合就打完（延長賽平手）
  const shortConfig: CtfConfig = { ...CTF_CONFIG, regularMaxRounds: 1, overtimeMaxRounds: 1 };

  it('再來一場：真人對戰要兩邊都同意', () => {
    const manager = new RoomManager({ ctfConfig: shortConfig });
    const { a, b } = startPlaying(manager);
    vi.advanceTimersByTime(ROUND_MS * 2);
    expect(a.lastRoom().phase).toBe('finished');

    a.send({ type: 'rematch' });
    expect(a.lastRoom().phase).toBe('finished');
    expect(b.lastRoom().seats.A?.wantsRematch).toBe(true);

    b.send({ type: 'rematch' });
    expect(a.lastRoom().phase).toBe('countdown');
    expect(a.lastRoom().game!.round).toBe(0);
    vi.advanceTimersByTime(COUNTDOWN_MS);
    expect(b.lastRoom().phase).toBe('playing');
  });

  it('再來一場：對 AI 按了就重新開始', () => {
    const manager = new RoomManager({ ctfConfig: shortConfig });
    const a = fakeClient(manager);
    a.send({ type: 'createRoom', nickname: '小明', opponent: 'aiRandomWalker' });
    vi.advanceTimersByTime(COUNTDOWN_MS + ROUND_MS * 2);
    expect(a.lastRoom().phase).toBe('finished');
    a.send({ type: 'rematch' });
    expect(a.lastRoom().phase).toBe('countdown');
  });

  it('對手回大廳後不能再來一場', () => {
    const manager = new RoomManager({ ctfConfig: shortConfig });
    const { a, b } = startPlaying(manager);
    vi.advanceTimersByTime(ROUND_MS * 2);
    b.send({ type: 'leaveRoom' });
    expect(b.lastOfType('leftRoom')).toBeDefined();
    expect(a.lastRoom().seats.B?.left).toBe(true);
    a.send({ type: 'rematch' });
    expect(a.lastRoom().phase).toBe('finished');
    expect(a.lastOfType('error')?.message).toContain('離開');
  });

  it('比賽結束後 5 分鐘沒人按任何按鈕：房間刪除', () => {
    const manager = new RoomManager({ ctfConfig: shortConfig });
    const { a } = startPlaying(manager);
    vi.advanceTimersByTime(ROUND_MS * 2);
    vi.advanceTimersByTime(SERVER_CONFIG.finishedRoomTtlMinutes * 60_000 - 1);
    expect(manager.roomCount).toBe(1);
    vi.advanceTimersByTime(1);
    expect(manager.roomCount).toBe(0);
    expect(a.lastOfType('leftRoom')).toBeDefined();
  });

  it('按了按鈕會重新計算 5 分鐘', () => {
    const manager = new RoomManager({ ctfConfig: shortConfig });
    const { a } = startPlaying(manager);
    vi.advanceTimersByTime(ROUND_MS * 2);
    vi.advanceTimersByTime(4 * 60_000);
    a.send({ type: 'rematch' });
    vi.advanceTimersByTime(4 * 60_000);
    expect(manager.roomCount).toBe(1);
  });
});
