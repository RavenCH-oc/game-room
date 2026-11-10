import { describe, expect, it } from 'vitest';
import { resolveRound } from '../core/index.ts';
import { FLAG_FAR_AWAY, makeState, move, positionOf, stay } from './helpers.ts';

describe('第 4 節／第 5 節步驟 3：移動', () => {
  it('往上下左右走一格', () => {
    const state = makeState({ A1: { position: { x: 3, y: 2 } }, flag: FLAG_FAR_AWAY });
    expect(positionOf(resolveRound(state, { A1: move('up') }).state, 'A1')).toEqual({ x: 3, y: 1 });
    expect(positionOf(resolveRound(state, { A1: move('down') }).state, 'A1')).toEqual({ x: 3, y: 3 });
    expect(positionOf(resolveRound(state, { A1: move('left') }).state, 'A1')).toEqual({ x: 2, y: 2 });
    expect(positionOf(resolveRound(state, { A1: move('right') }).state, 'A1')).toEqual({ x: 4, y: 2 });
  });

  it('撞牆留在原位', () => {
    // (2, 3) 是牆
    const state = makeState({ A1: { position: { x: 2, y: 2 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: move('down') });
    expect(positionOf(next, 'A1')).toEqual({ x: 2, y: 2 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', characterId: 'A1', reason: 'wall' }));
  });

  it('出界留在原位', () => {
    const state = makeState({ A1: { position: { x: 0, y: 0 } }, flag: FLAG_FAR_AWAY });
    const up = resolveRound(state, { A1: move('up') });
    const left = resolveRound(state, { A1: move('left') });
    expect(positionOf(up.state, 'A1')).toEqual({ x: 0, y: 0 });
    expect(positionOf(left.state, 'A1')).toEqual({ x: 0, y: 0 });
    expect(up.events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', reason: 'outOfBounds' }));
  });

  it('走進對方重生點留在原位', () => {
    // B 隊重生點 (8, 4)
    const state = makeState({
      A1: { position: { x: 7, y: 4 } },
      B1: { position: { x: 8, y: 0 } },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next, events } = resolveRound(state, { A1: move('right') });
    expect(positionOf(next, 'A1')).toEqual({ x: 7, y: 4 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', reason: 'enemySpawn' }));
  });

  it('可以走進自己的重生點', () => {
    const state = makeState({ A1: { position: { x: 1, y: 4 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: move('left') });
    expect(positionOf(next, 'A1')).toEqual({ x: 0, y: 4 });
  });

  it('同格衝突：兩個角色要走進同一格，兩邊都彈回原位', () => {
    const state = makeState({
      A1: { position: { x: 3, y: 0 } },
      B1: { position: { x: 5, y: 0 } },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next, events } = resolveRound(state, { A1: move('right'), B1: move('left') });
    expect(positionOf(next, 'A1')).toEqual({ x: 3, y: 0 });
    expect(positionOf(next, 'B1')).toEqual({ x: 5, y: 0 });
    expect(events.filter((event) => event.type === 'moveBlocked' && event.reason === 'sameTarget')).toHaveLength(2);
  });

  it('互換位置（擦身而過）：兩邊都彈回原位', () => {
    const state = makeState({
      A1: { position: { x: 3, y: 0 } },
      B1: { position: { x: 4, y: 0 } },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next, events } = resolveRound(state, { A1: move('right'), B1: move('left') });
    expect(positionOf(next, 'A1')).toEqual({ x: 3, y: 0 });
    expect(positionOf(next, 'B1')).toEqual({ x: 4, y: 0 });
    expect(events.filter((event) => event.type === 'moveBlocked' && event.reason === 'swap')).toHaveLength(2);
  });

  it('走向這回合沒有離開的角色所在格子：留在原位', () => {
    const state = makeState({
      A1: { position: { x: 3, y: 0 } },
      B1: { position: { x: 4, y: 0 } },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next, events } = resolveRound(state, { A1: move('right'), B1: stay });
    expect(positionOf(next, 'A1')).toEqual({ x: 3, y: 0 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', characterId: 'A1', reason: 'occupied' }));
  });

  it('前面的角色同時走開，就可以跟著走進他原本的格子', () => {
    const state = makeState({
      A1: { position: { x: 3, y: 0 } },
      B1: { position: { x: 4, y: 0 } },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: move('right'), B1: move('right') });
    expect(positionOf(next, 'A1')).toEqual({ x: 4, y: 0 });
    expect(positionOf(next, 'B1')).toEqual({ x: 5, y: 0 });
  });

  it('前面的角色想走開但撞牆彈回，跟在後面的也留在原位', () => {
    // B1 往下撞牆 (4, 1)，A1 想走進 B1 原本的格子
    const state = makeState({
      A1: { position: { x: 3, y: 0 } },
      B1: { position: { x: 4, y: 0 } },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: move('right'), B1: move('down') });
    expect(positionOf(next, 'A1')).toEqual({ x: 3, y: 0 });
    expect(positionOf(next, 'B1')).toEqual({ x: 4, y: 0 });
  });
});
