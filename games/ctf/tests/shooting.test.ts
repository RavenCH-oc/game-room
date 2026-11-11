import { describe, expect, it } from 'vitest';
import { CTF_CONFIG, resolveRound, type GameState } from '../core/index.ts';
import { FLAG_FAR_AWAY, dropFlag, hpOf, makeState, move, positionOf, shoot, stay } from './helpers.ts';

describe('第 4 節／第 5 節步驟 1：射擊的命中範圍', () => {
  it('距離 1 格命中', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 2, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right') });
    expect(hpOf(next, 'B1')).toBe(2);
    expect(events).toContainEqual(expect.objectContaining({ type: 'shot', shooterId: 'A1', hitId: 'B1' }));
  });

  it('距離 2 格命中', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right') });
    expect(hpOf(next, 'B1')).toBe(2);
  });

  it('距離 3 格打不到', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 4, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right') });
    expect(hpOf(next, 'B1')).toBe(3);
    expect(events).toContainEqual(expect.objectContaining({ type: 'shot', shooterId: 'A1', hitId: null }));
  });

  it('牆壁擋住射擊', () => {
    // (4, 1) 是牆，A1 在 (4, 0) 往下射，B1 在 (4, 2)
    const state = makeState({ A1: { position: { x: 4, y: 0 } }, B1: { position: { x: 4, y: 2 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('down') });
    expect(hpOf(next, 'B1')).toBe(3);
  });

  it('只打中路徑上第一個角色', () => {
    // A1 往右射：B1 在 (2, 0)、B2 在 (3, 0)，只有 B1 受傷
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 2, y: 0 } },
      extra: [{ id: 'B2', team: 'B', position: { x: 3, y: 0 } }],
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: shoot('right') });
    expect(hpOf(next, 'B1')).toBe(2);
    expect(hpOf(next, 'B2')).toBe(3);
  });

  it('v0.2 補充：重生點和地上的旗子不會擋住射擊', () => {
    // 子彈穿過地上的旗子 (4, 4)
    const throughFlag = makeState({
      A1: { position: { x: 3, y: 4 } },
      B1: { position: { x: 5, y: 4 } },
      flag: { status: 'onGround', position: { x: 4, y: 4 } },
    });
    expect(hpOf(resolveRound(throughFlag, { A1: shoot('right') }).state, 'B1')).toBe(2);

    // B1 站在 (0, 3) 往下射，子彈穿過 A 隊重生點 (0, 4)，打到 (0, 5) 的 A1
    const throughSpawn = makeState({
      A1: { position: { x: 0, y: 5 } },
      B1: { position: { x: 0, y: 3 } },
      flag: FLAG_FAR_AWAY,
    });
    expect(hpOf(resolveRound(throughSpawn, { B1: shoot('down') }).state, 'A1')).toBe(2);
  });

  it('射擊以回合開始時的位置判定：目標同回合走開也會被打中', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: move('right') });
    expect(hpOf(next, 'B1')).toBe(2);
  });
});

describe('第 5 節步驟 1：生命值與倒地', () => {
  it('開場每個角色有 3 點生命值', () => {
    const state = makeState();
    expect(hpOf(state, 'A1')).toBe(3);
    expect(hpOf(state, 'B1')).toBe(3);
  });

  it('被打中扣 1 點且留在場上，這回合的動作照常執行', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: move('down') });
    expect(hpOf(next, 'B1')).toBe(2);
    expect(positionOf(next, 'B1')).toEqual({ x: 3, y: 1 });
    expect(events).toContainEqual({ type: 'damaged', characterId: 'B1', byId: 'A1', damage: 1, hpLeft: 2 });
    expect(events.some((event) => event.type === 'knockedDown')).toBe(false);
  });

  it('第三槍才倒地', () => {
    let state: GameState = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 2, y: 0 } }, flag: FLAG_FAR_AWAY });
    state = resolveRound(state, { A1: shoot('right') }).state;
    expect(hpOf(state, 'B1')).toBe(2);
    expect(positionOf(state, 'B1')).not.toBeNull();

    state = resolveRound(state, { A1: shoot('right') }).state;
    expect(hpOf(state, 'B1')).toBe(1);
    expect(positionOf(state, 'B1')).not.toBeNull();

    const third = resolveRound(state, { A1: shoot('right') });
    expect(hpOf(third.state, 'B1')).toBe(0);
    expect(positionOf(third.state, 'B1')).toBeNull();
    expect(third.state.knockdowns).toEqual({ A: 1, B: 0 });
    expect(third.events).toContainEqual(expect.objectContaining({ type: 'knockedDown', characterId: 'B1', byIds: ['A1'] }));
  });

  it('同一回合被兩人打中扣 2 點', () => {
    // A1 從左邊、A2 從右邊同時打 B1
    const state = makeState({
      A1: { position: { x: 3, y: 2 } },
      B1: { position: { x: 4, y: 2 } },
      extra: [{ id: 'A2', team: 'A', position: { x: 5, y: 2 } }],
      flag: FLAG_FAR_AWAY,
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), A2: shoot('left') });
    expect(hpOf(next, 'B1')).toBe(1);
    expect(events.filter((event) => event.type === 'damaged' && event.characterId === 'B1')).toHaveLength(2);
  });

  it('同一回合被兩人打中而倒地，擊倒數只加 1', () => {
    const state = makeState({
      A1: { position: { x: 3, y: 2 } },
      B1: { position: { x: 4, y: 2 }, hp: 2 },
      extra: [{ id: 'A2', team: 'A', position: { x: 5, y: 2 } }],
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: shoot('right'), A2: shoot('left') });
    expect(positionOf(next, 'B1')).toBeNull();
    expect(next.knockdowns).toEqual({ A: 1, B: 0 });
  });

  it('互相射擊：各扣 1 點', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: shoot('left') });
    expect(hpOf(next, 'A1')).toBe(2);
    expect(hpOf(next, 'B1')).toBe(2);
    expect(next.knockdowns).toEqual({ A: 0, B: 0 });
  });

  it('互相射擊：兩邊都剩 1 點時同時倒地，雙方擊倒數各加 1', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 }, hp: 1 },
      B1: { position: { x: 3, y: 0 }, hp: 1 },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: shoot('left') });
    expect(positionOf(next, 'A1')).toBeNull();
    expect(positionOf(next, 'B1')).toBeNull();
    expect(next.knockdowns).toEqual({ A: 1, B: 1 });
    expect(events.filter((event) => event.type === 'knockedDown')).toHaveLength(2);
  });

  it('倒地的角色這回合的移動取消', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 }, hp: 1 },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: move('down') });
    expect(positionOf(next, 'B1')).toBeNull();
    expect(events.some((event) => event.type === 'moved' && event.characterId === 'B1')).toBe(false);
  });

  it('倒地的角色同回合的射擊仍然有效', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 }, hp: 1 },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: shoot('left') });
    expect(positionOf(next, 'B1')).toBeNull();
    expect(hpOf(next, 'A1')).toBe(2);
  });

  it('v0.2 補充：這回合剛倒地的角色原本的格子可以走進去', () => {
    // A2 打倒 B1 (3, 0)，同回合 A1 從 (2, 0) 走進 (3, 0)
    const state = makeState({
      A1: { position: { x: 2, y: 0 } },
      B1: { position: { x: 3, y: 0 }, hp: 1 },
      extra: [{ id: 'A2', team: 'A', position: { x: 5, y: 0 } }],
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: move('right'), A2: shoot('left') });
    expect(positionOf(next, 'B1')).toBeNull();
    expect(positionOf(next, 'A1')).toEqual({ x: 3, y: 0 });
  });

  it('沒打中人的射擊不影響任何人', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 1, y: 8 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: stay });
    expect(hpOf(next, 'B1')).toBe(3);
  });
});

describe('第 4 節／第 5 節步驟 1：持旗者與射擊', () => {
  it('持旗者射擊被當作不動', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 2, y: 0 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right') });
    expect(hpOf(next, 'B1')).toBe(3);
    expect(positionOf(next, 'A1')).toEqual({ x: 1, y: 0 });
    expect(events.some((event) => event.type === 'shot')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: 'invalidAction', characterId: 'A1' }));
  });

  it('v0.3：持旗者被打中但沒倒地，旗子掉在他回合開始時的那一格，他這回合的移動照常執行', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: move('down') });
    expect(hpOf(next, 'B1')).toBe(2);
    expect(positionOf(next, 'B1')).toEqual({ x: 3, y: 1 });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
    expect(events).toContainEqual({ type: 'flagDropped', characterId: 'B1', position: { x: 3, y: 0 }, reason: 'hit' });
  });

  it('掉旗開關關掉時：持旗者被打中但沒倒地，旗子還在手上', () => {
    const config = { ...CTF_CONFIG, dropFlagWhenHit: false };
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: move('down') }, config);
    expect(hpOf(next, 'B1')).toBe(2);
    expect(next.flag).toEqual({ status: 'carried', carrierId: 'B1' });
    expect(positionOf(next, 'B1')).toEqual({ x: 3, y: 1 });
  });

  it('v0.3：被打掉的旗子，同一回合可以被走進那一格的對手撿起', () => {
    // A1 打掉 B1 的旗子；B1 往下走開；A2 同回合從左邊走進 (3, 0) 撿起
    const state = makeState({
      A1: { position: { x: 5, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      extra: [{ id: 'A2', team: 'A', position: { x: 2, y: 0 } }],
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('left'), B1: move('down'), A2: move('right') });
    expect(next.flag).toEqual({ status: 'carried', carrierId: 'A2' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'flagPickedUp', characterId: 'A2' }));
  });

  it('v0.3：被打掉旗子的人還站在那一格，不會自動撿回', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: stay });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
  });

  it('v0.3：持旗者被打中時選了放旗，旗子只掉一次', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: dropFlag });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
    expect(events.filter((event) => event.type === 'flagDropped')).toEqual([expect.objectContaining({ reason: 'hit' })]);
  });

  it('v0.3：無敵中的持旗者被射擊不會掉旗', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 }, invulnerableRoundsLeft: 2 },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: move('down') });
    expect(hpOf(next, 'B1')).toBe(3);
    expect(next.flag).toEqual({ status: 'carried', carrierId: 'B1' });
  });

  it('持旗者倒地：旗子掉在他原本的格子', () => {
    // B1 拿旗在 (3, 0)，只剩 1 點，同回合想往右走
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 }, hp: 1 },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: move('right') });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'flagDropped', characterId: 'B1', reason: 'knockedDown' }),
    );
  });

  it('持旗者倒地時選的放旗也取消，旗子仍掉在原地', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 }, hp: 1 },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: dropFlag });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
    expect(events.filter((event) => event.type === 'flagDropped')).toEqual([
      expect.objectContaining({ reason: 'knockedDown' }),
    ]);
  });
});
