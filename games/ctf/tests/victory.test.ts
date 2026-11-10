import { describe, expect, it } from 'vitest';
import { resolveRound } from '../core/index.ts';
import { FLAG_FAR_AWAY, makeState, move } from './helpers.ts';

describe('第 6 節：勝負', () => {
  it('先拿到 3 分的一方獲勝', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
      scores: { A: 2, B: 1 },
    });
    const { state: next, events } = resolveRound(state, { A1: move('left') });
    expect(next.scores.A).toBe(3);
    expect(next.result).toEqual({ winner: 'A' });
    expect(events).toContainEqual({ type: 'gameOver', result: { winner: 'A' } });
  });

  it('2 分時得分還不算獲勝', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
      scores: { A: 1, B: 0 },
    });
    const { state: next } = resolveRound(state, { A1: move('left') });
    expect(next.result).toBeNull();
  });

  it('200 回合上限：分數高的獲勝', () => {
    const state = makeState({ round: 199, scores: { A: 1, B: 2 }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, {});
    expect(next.round).toBe(200);
    expect(next.result).toEqual({ winner: 'B' });
  });

  it('200 回合上限：同分算平手', () => {
    const state = makeState({ round: 199, scores: { A: 1, B: 1 }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, {});
    expect(next.result).toEqual({ winner: null, draw: true });
    expect(events).toContainEqual({ type: 'gameOver', result: { winner: null, draw: true } });
  });

  it('第 199 回合結束時還不會判定', () => {
    const state = makeState({ round: 198, scores: { A: 1, B: 0 }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, {});
    expect(next.round).toBe(199);
    expect(next.result).toBeNull();
  });

  it('第 200 回合拿到第 3 分，算拿滿 3 分獲勝', () => {
    const state = makeState({
      round: 199,
      A1: { position: { x: 1, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
      scores: { A: 2, B: 2 },
    });
    const { state: next } = resolveRound(state, { A1: move('left') });
    expect(next.result).toEqual({ winner: 'A' });
  });
});
