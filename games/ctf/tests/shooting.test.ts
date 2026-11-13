// 規則第 5 節步驟 5（射擊）與第 9 節「射擊」「旗子」的測試。
// v0.4：射擊在移動之後才判定，打的是大家「移動後」的位置；射程 3 格。

import { describe, expect, it } from 'vitest';
import { CTF_CONFIG, resolveRound, type GameState } from '../core/index.ts';
import { FLAG_FAR_AWAY, dropFlag, hpOf, makeState, move, positionOf, shoot, stay } from './helpers.ts';

describe('第 9 節 射擊：命中範圍（射程 3 格）', () => {
  it('距離 1、2、3 格都命中', () => {
    for (const distance of [1, 2, 3]) {
      const state = makeState({
        A1: { position: { x: 1, y: 0 } },
        B1: { position: { x: 1 + distance, y: 0 } },
        flag: FLAG_FAR_AWAY,
      });
      const { state: next, events } = resolveRound(state, { A1: shoot('right') });
      expect(hpOf(next, 'B1')).toBe(2);
      expect(events).toContainEqual(expect.objectContaining({ type: 'shot', shooterId: 'A1', hitId: 'B1' }));
    }
  });

  it('距離 4 格打不到', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 5, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right') });
    expect(hpOf(next, 'B1')).toBe(3);
    expect(events).toContainEqual(expect.objectContaining({ type: 'shot', hitId: null, endPosition: { x: 4, y: 0 } }));
  });

  it('牆壁擋住射擊', () => {
    // (4, 1) 是牆，A1 在 (4, 0) 往下射，B1 在 (4, 2)
    const state = makeState({ A1: { position: { x: 4, y: 0 } }, B1: { position: { x: 4, y: 2 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('down') });
    expect(hpOf(next, 'B1')).toBe(3);
    expect(events).toContainEqual(expect.objectContaining({ type: 'shot', hitId: null, endPosition: { x: 4, y: 0 } }));
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

  it('重生點和地上的旗子不會擋住射擊', () => {
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

  it('沒打中人的射擊不影響任何人', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 1, y: 8 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: stay });
    expect(hpOf(next, 'B1')).toBe(3);
  });
});

describe('第 9 節 射擊：以移動後的位置判定（v0.4）', () => {
  it('目標這回合走出射擊線：打不到（閃掉了）', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: move('down') });
    expect(positionOf(next, 'B1')).toEqual({ x: 3, y: 1 });
    expect(hpOf(next, 'B1')).toBe(3);
    expect(events).toContainEqual(expect.objectContaining({ type: 'shot', hitId: null, dodgedId: 'B1' }));
  });

  it('目標這回合走進射擊線：被打到', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 1 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: move('up') });
    expect(positionOf(next, 'B1')).toEqual({ x: 3, y: 0 });
    expect(hpOf(next, 'B1')).toBe(2);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'shot', hitId: 'B1', dodgedId: null, movedIntoLine: true }),
    );
  });

  it('一直站在射擊線上被打到：不算「走進射擊線」', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { events } = resolveRound(state, { A1: shoot('right'), B1: stay });
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'shot', hitId: 'B1', dodgedId: null, movedIntoLine: false }),
    );
  });

  it('目標沿著射擊線後退，移動後剛好超出射程：打不到', () => {
    // B1 從 (4, 0) 退到 (5, 0)，距離 A1 變成 4 格
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 4, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: move('right') });
    expect(positionOf(next, 'B1')).toEqual({ x: 5, y: 0 });
    expect(hpOf(next, 'B1')).toBe(3);
  });

  it('目標沿著射擊線後退，移動後還在射程內：被打到', () => {
    // B1 從 (3, 0) 退到 (4, 0)，距離 A1 是 3 格
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: move('right') });
    expect(positionOf(next, 'B1')).toEqual({ x: 4, y: 0 });
    expect(hpOf(next, 'B1')).toBe(2);
  });

  it('開槍的人從原地開槍', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 4, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right') });
    expect(positionOf(next, 'A1')).toEqual({ x: 1, y: 0 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'shot', from: { x: 1, y: 0 } }));
  });
});

describe('第 9 節 射擊：生命值與倒地', () => {
  it('開場每個角色有 3 點生命值', () => {
    const state = makeState();
    expect(hpOf(state, 'A1')).toBe(3);
    expect(hpOf(state, 'B1')).toBe(3);
  });

  it('被打中扣 1 點且留在場上', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: stay });
    expect(hpOf(next, 'B1')).toBe(2);
    expect(positionOf(next, 'B1')).toEqual({ x: 3, y: 0 });
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

  it('倒地的角色同回合的移動先發生（移動在射擊之前），倒地後離場', () => {
    // B1 只剩 1 點，往下走一格，剛好走進 A1 的射擊線 (1, 0)→往下
    const state = makeState({
      A1: { position: { x: 1, y: 3 } },
      B1: { position: { x: 1, y: 0 }, hp: 1 },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('up'), B1: move('down') });
    expect(events).toContainEqual(expect.objectContaining({ type: 'moved', characterId: 'B1', to: { x: 1, y: 1 } }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'knockedDown', characterId: 'B1', position: { x: 1, y: 1 } }));
    expect(positionOf(next, 'B1')).toBeNull();
  });
});

describe('第 9 節 射擊：持旗者不能射擊', () => {
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
});

describe('第 9 節 旗子：持旗者被打中', () => {
  it('持旗者被打中但沒倒地：旗子掉在他移動後站的那一格', () => {
    // B1 拿著旗從 (3, 1) 往上走到 (3, 0)，走進 A1 的射擊線
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 1 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: move('up') });
    expect(hpOf(next, 'B1')).toBe(2);
    expect(positionOf(next, 'B1')).toEqual({ x: 3, y: 0 });
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
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: stay }, config);
    expect(hpOf(next, 'B1')).toBe(2);
    expect(next.flag).toEqual({ status: 'carried', carrierId: 'B1' });
  });

  it('同一回合剛撿起旗子就被打中：旗子掉在那一格', () => {
    // 旗子在 (3, 0)；B1 從 (3, 1) 往上走進去撿起，同回合被 A1 打中
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 1 } },
      flag: { status: 'onGround', position: { x: 3, y: 0 } },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: move('up') });
    expect(events).toContainEqual(expect.objectContaining({ type: 'flagPickedUp', characterId: 'B1' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'flagDropped', characterId: 'B1', reason: 'hit' }));
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
  });

  it('這回合被打掉的旗子，同回合不會被任何人撿起；下一回合走進那格的人可以撿', () => {
    // 第 1 回合：B1 拿旗從 (3, 1) 走到 (3, 0)，被 A1 從 (3, 3) 往上打中（距離 3），旗子掉在 (3, 0)
    let state: GameState = makeState({
      A1: { position: { x: 3, y: 3 } },
      B1: { position: { x: 3, y: 1 } },
      extra: [{ id: 'A2', team: 'A', position: { x: 2, y: 0 } }],
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const first = resolveRound(state, { A1: shoot('up'), B1: move('up'), A2: stay });
    state = first.state;
    expect(state.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
    expect(first.events.some((event) => event.type === 'flagPickedUp')).toBe(false);

    // 第 2 回合：B1 往下離開，A2 從左邊走進 (3, 0)，撿起旗子
    const second = resolveRound(state, { B1: move('down'), A2: move('right') });
    expect(second.state.flag).toEqual({ status: 'carried', carrierId: 'A2' });
  });

  it('被打掉旗子的人還站在那一格，不會自動撿回', () => {
    let state: GameState = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    state = resolveRound(state, { A1: shoot('right'), B1: stay }).state;
    expect(state.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
    state = resolveRound(state, { B1: stay }).state;
    expect(state.flag.status).toBe('onGround');
  });

  it('無敵中的持旗者被射擊不會掉旗', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 }, invulnerableRoundsLeft: 2 },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: stay });
    expect(hpOf(next, 'B1')).toBe(3);
    expect(next.flag).toEqual({ status: 'carried', carrierId: 'B1' });
  });

  it('持旗者倒地：旗子掉在他現在站的那一格', () => {
    // B1 只剩 1 點，拿旗從 (3, 1) 走到 (3, 0) 被打倒
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 1 }, hp: 1 },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: move('up') });
    expect(positionOf(next, 'B1')).toBeNull();
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
    expect(events).toContainEqual(expect.objectContaining({ type: 'flagDropped', characterId: 'B1', reason: 'knockedDown' }));
  });

  it('同回合先放下旗子再被打中：旗子只掉一次（放旗在射擊之前）', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const { state: next, events } = resolveRound(state, { A1: shoot('right'), B1: dropFlag });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 3, y: 0 } });
    expect(hpOf(next, 'B1')).toBe(2);
    expect(events.filter((event) => event.type === 'flagDropped')).toEqual([
      expect.objectContaining({ reason: 'dropped' }),
    ]);
  });

  it('帶旗踏進自己重生點的那一回合被射擊：照樣得分，另外扣生命值', () => {
    // A1 拿旗從 (1, 4) 走進自己家 (0, 4)；B1 在 (2, 4) 往左射，打到移動後的 A1
    const state = makeState({
      A1: { position: { x: 1, y: 4 } },
      B1: { position: { x: 2, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next, events } = resolveRound(state, { A1: move('left'), B1: shoot('left') });
    expect(next.scores.A).toBe(1);
    expect(hpOf(next, 'A1')).toBe(2);
    expect(next.flag.status).toBe('hidden'); // v0.5：得分後旗子進入隱藏
    expect(events.some((event) => event.type === 'flagDropped')).toBe(false);
  });
});
