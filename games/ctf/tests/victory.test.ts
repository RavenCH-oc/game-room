import { describe, expect, it } from 'vitest';
import { resolveRound, type GameState } from '../core/index.ts';
import { FLAG_FAR_AWAY, makeState, move, shoot } from './helpers.ts';

// 用來「帶旗回家得分」的場面：A1 拿著旗子站在自己重生點旁邊
const carrierNextToHome = {
  A1: { position: { x: 1, y: 4 } },
  flag: { status: 'carried', carrierId: 'A1' },
} as const;

describe('第 6 節：正規賽', () => {
  it('先拿到 3 分立刻獲勝', () => {
    const state = makeState({ ...carrierNextToHome, scores: { A: 2, B: 1 } });
    const { state: next, events } = resolveRound(state, { A1: move('left') });
    expect(next.scores.A).toBe(3);
    expect(next.result).toEqual({ winner: 'A', reason: 'reachedWinningScore' });
    expect(events).toContainEqual({ type: 'gameOver', result: { winner: 'A', reason: 'reachedWinningScore' } });
  });

  it('v0.4：拿到第 3 分的那一回合，射擊仍然結算（整回合做完才判定勝負）', () => {
    // A1 帶第 3 分回家，同回合被 B1 打倒：照樣獲勝，B 的擊倒數也加 1
    const state = makeState({
      A1: { position: { x: 1, y: 4 }, hp: 1 },
      B1: { position: { x: 3, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
      scores: { A: 2, B: 0 },
    });
    const { state: next } = resolveRound(state, { A1: move('left'), B1: shoot('left') });
    expect(next.result).toEqual({ winner: 'A', reason: 'reachedWinningScore' });
    expect(next.knockdowns).toEqual({ A: 0, B: 1 });
    expect(next.characters[0]!.position).toBeNull();
  });

  it('2 分時得分還不算獲勝', () => {
    const state = makeState({ ...carrierNextToHome, scores: { A: 1, B: 0 } });
    const { state: next } = resolveRound(state, { A1: move('left') });
    expect(next.result).toBeNull();
  });

  it('在第 200 回合拿到第 3 分，算拿到 3 分獲勝', () => {
    const state = makeState({ ...carrierNextToHome, round: 199, scores: { A: 2, B: 2 } });
    const { state: next } = resolveRound(state, { A1: move('left') });
    expect(next.round).toBe(200);
    expect(next.result).toEqual({ winner: 'A', reason: 'reachedWinningScore' });
  });

  it('第 199 回合結算完還不會判定', () => {
    const state = makeState({ round: 198, scores: { A: 1, B: 0 }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, {});
    expect(next.round).toBe(199);
    expect(next.result).toBeNull();
    expect(next.phase).toBe('regular');
  });

  it('第 200 回合結算完：分數高的贏', () => {
    const state = makeState({ round: 199, scores: { A: 1, B: 2 }, knockdowns: { A: 5, B: 0 }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, {});
    expect(next.result).toEqual({ winner: 'B', reason: 'higherScore' });
  });

  it('第 200 回合結算完：同分時擊倒數多的贏', () => {
    const state = makeState({ round: 199, scores: { A: 1, B: 1 }, knockdowns: { A: 3, B: 2 }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, {});
    expect(next.result).toEqual({ winner: 'A', reason: 'moreKnockdowns' });
  });

  it('第 200 回合當中的擊倒也算進擊倒數比較', () => {
    // 原本擊倒數 0:0，第 200 回合 A1 打倒 B1 → A 擊倒數較多
    const state = makeState({
      round: 199,
      scores: { A: 0, B: 0 },
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 2, y: 0 }, hp: 1 },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: shoot('right') });
    expect(next.result).toEqual({ winner: 'A', reason: 'moreKnockdowns' });
  });

  it('第 200 回合結算完：分數和擊倒數都相同，進入延長賽', () => {
    const state = makeState({ round: 199, scores: { A: 1, B: 1 }, knockdowns: { A: 2, B: 2 }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, {});
    expect(next.result).toBeNull();
    expect(next.phase).toBe('overtime');
    expect(events).toContainEqual({ type: 'overtimeStarted' });
  });

  it('進入延長賽時場面原樣接續（位置、生命值、旗子、離場倒數都不重置）', () => {
    const state = makeState({
      round: 199,
      A1: { position: { x: 3, y: 3 }, hp: 1 },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'onGround', position: { x: 5, y: 5 } },
    });
    const { state: next } = resolveRound(state, {});
    expect(next.phase).toBe('overtime');
    expect(next.characters[0]).toMatchObject({ position: { x: 3, y: 3 }, hp: 1 });
    expect(next.characters[1]).toMatchObject({ position: null, respawnCountdown: 1 });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 5, y: 5 } });
  });
});

describe('第 6 節：延長賽', () => {
  const overtime = { phase: 'overtime', round: 210, scores: { A: 1, B: 1 }, knockdowns: { A: 2, B: 2 } } as const;

  it('先得 1 分的贏', () => {
    const state = makeState({ ...overtime, ...carrierNextToHome });
    const { state: next } = resolveRound(state, { A1: move('left') });
    expect(next.result).toEqual({ winner: 'A', reason: 'overtimeScore' });
  });

  it('先打倒對方的贏', () => {
    const state = makeState({
      ...overtime,
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 2, y: 0 }, hp: 1 },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: shoot('right') });
    expect(next.result).toEqual({ winner: 'A', reason: 'overtimeKnockdown' });
  });

  it('同一回合一隊得分、另一隊打倒對方：得分優先（v0.4 起 1v1 也可能發生）', () => {
    const state = makeState({
      ...overtime,
      A1: { position: { x: 1, y: 4 }, hp: 1 },
      B1: { position: { x: 3, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next } = resolveRound(state, { A1: move('left'), B1: shoot('left') });
    expect(next.characters[0]!.position).toBeNull(); // A1 被打倒了
    expect(next.result).toEqual({ winner: 'A', reason: 'overtimeScore' });
  });

  it('只是打傷沒有打倒，延長賽繼續', () => {
    const state = makeState({
      ...overtime,
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 2, y: 0 } },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: shoot('right') });
    expect(next.result).toBeNull();
  });

  it('同一回合雙方互相打倒，不分勝負，延長賽繼續', () => {
    const state = makeState({
      ...overtime,
      A1: { position: { x: 1, y: 0 }, hp: 1 },
      B1: { position: { x: 2, y: 0 }, hp: 1 },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: shoot('left') });
    expect(next.result).toBeNull();
    expect(next.phase).toBe('overtime');
    expect(next.knockdowns).toEqual({ A: 3, B: 3 });
  });

  it('延長賽 50 回合到了還沒分出勝負，算平手', () => {
    // 第 200 回合後進延長賽，延長賽第 50 回合 = 第 250 回合
    let state: GameState = makeState({ ...overtime, round: 248, flag: FLAG_FAR_AWAY });
    state = resolveRound(state, {}).state;
    expect(state.round).toBe(249);
    expect(state.result).toBeNull();

    const { state: next, events } = resolveRound(state, {});
    expect(next.round).toBe(250);
    expect(next.result).toEqual({ winner: null, reason: 'draw' });
    expect(events).toContainEqual({ type: 'gameOver', result: { winner: null, reason: 'draw' } });
  });

  it('從正規賽一路不動到延長賽結束：第 250 回合平手', () => {
    let state: GameState = makeState({ flag: FLAG_FAR_AWAY });
    while (!state.result) {
      state = resolveRound(state, {}).state;
    }
    expect(state.round).toBe(250);
    expect(state.result).toEqual({ winner: null, reason: 'draw' });
  });
});

describe('第 6 節「其他」：比賽結束後', () => {
  it('比賽結束後再結算，場面不變、沒有事件', () => {
    const state = makeState({ round: 120, scores: { A: 3, B: 1 }, flag: FLAG_FAR_AWAY });
    state.result = { winner: 'A', reason: 'reachedWinningScore' };
    const { state: next, events } = resolveRound(state, { A1: move('right'), B1: shoot('left') });
    expect(next).toEqual(state);
    expect(events).toEqual([]);
  });
});
