import { describe, expect, it } from 'vitest';
import { resolveRound } from '../core/index.ts';
import { FLAG_FAR_AWAY, characterOf, makeState, move, positionOf, shoot, stay } from './helpers.ts';

describe('第 4 節／第 5 節步驟 1：射擊', () => {
  it('距離 1 格命中', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 2, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right') });
    expect(positionOf(next, 'B1')).toBeNull();
    expect(events).toContainEqual(expect.objectContaining({ type: 'eliminated', characterId: 'B1', byId: 'A1' }));
  });

  it('距離 2 格命中', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right') });
    expect(positionOf(next, 'B1')).toBeNull();
  });

  it('距離 3 格打不到', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 4, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right') });
    expect(positionOf(next, 'B1')).toEqual({ x: 4, y: 0 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'shot', shooterId: 'A1', hitId: null }));
  });

  it('牆壁擋住射擊', () => {
    // (4, 1) 是牆，A1 在 (4, 0) 往下射，B1 在 (4, 2)
    const state = makeState({ A1: { position: { x: 4, y: 0 } }, B1: { position: { x: 4, y: 2 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('down') });
    expect(positionOf(next, 'B1')).toEqual({ x: 4, y: 2 });
  });

  it('只打中路徑上第一個角色（1v1 中打到第一個就停，不會穿過去）', () => {
    // 1v1 只有兩個角色，用事件確認子彈打到的是第一個遇到的角色
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 2, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { events } = resolveRound(state, { A1: shoot('right') });
    const shots = events.filter((event) => event.type === 'shot');
    expect(shots).toEqual([expect.objectContaining({ shooterId: 'A1', hitId: 'B1' })]);
    expect(events.filter((event) => event.type === 'eliminated')).toHaveLength(1);
  });

  it('射擊以回合開始時的位置判定：目標同回合走開也會被打中', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: move('right') });
    expect(positionOf(next, 'B1')).toBeNull();
  });

  it('互相射擊：同歸於盡', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: shoot('left') });
    expect(positionOf(next, 'A1')).toBeNull();
    expect(positionOf(next, 'B1')).toBeNull();
    expect(events.filter((event) => event.type === 'eliminated')).toHaveLength(2);
  });

  it('被打中的角色，這回合的移動取消', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { events } = resolveRound(state, { A1: shoot('right'), B1: move('down') });
    expect(events.some((event) => event.type === 'moved' && event.characterId === 'B1')).toBe(false);
    expect(characterOf(resolveRound(state, { A1: shoot('right'), B1: move('down') }).state, 'B1').position).toBeNull();
  });

  it('持旗者射擊被當作不動', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 2, y: 0 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right') });
    expect(positionOf(next, 'B1')).toEqual({ x: 2, y: 0 });
    expect(positionOf(next, 'A1')).toEqual({ x: 1, y: 0 });
    expect(events.some((event) => event.type === 'shot')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: 'invalidAction', characterId: 'A1' }));
  });

  it('持旗者被淘汰：旗子掉在他原本的格子', () => {
    // B1 拿旗在 (3, 0)，同回合想往右走，被 A1 打中
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: move('right') });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'flagDropped', characterId: 'B1', reason: 'eliminated' }),
    );
  });

  it('持旗者被淘汰時選的放旗也取消，旗子仍掉在原地', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: { type: 'dropFlag' } });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
    expect(events.filter((event) => event.type === 'flagDropped')).toEqual([
      expect.objectContaining({ reason: 'eliminated' }),
    ]);
  });

  it('沒打中人的射擊不影響任何人', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 1, y: 8 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: stay });
    expect(positionOf(next, 'B1')).toEqual({ x: 1, y: 8 });
  });
});
