// v0.7：減少僵持——原地連射與過熱、旗子重抽（規則第 5 節、第 9 節）

import { describe, expect, it } from 'vitest';
import { createAttacker } from '../bots/attacker.ts';
import { createCodex, legalActions } from '../bots/codex/index.ts';
import { createGeometry } from '../bots/codex/geometry.ts';
import { createMatchBots, runMatch } from '../scripts/matchRunner.ts';
import {
  CLASSIC_MAP_9X9,
  CTF_CONFIG,
  createInitialState,
  getCharacterView,
  resolveRound,
  shootRangeOf,
  type Action,
  type ActionMap,
  type CtfConfig,
  type GameEvent,
  type GameState,
  type Position,
} from '../core/index.ts';
import { characterOf, dropFlag, FLAG_FAR_AWAY, makeState, move, positionOf, shoot, stay } from './helpers.ts';

/** 把某個角色搬到指定的格子（只改測試用的場面複本） */
function place(state: GameState, id: string, position: Position): GameState {
  const copy = structuredClone(state);
  characterOf(copy, id).position = { ...position };
  return copy;
}

const shotEvents = (events: GameEvent[]) => events.filter((event) => event.type === 'shot');
const shotRange = (events: GameEvent[]): number | undefined => {
  const shot = events.find((event) => event.type === 'shot');
  return shot?.type === 'shot' ? shot.range : undefined;
};

/** A1 在 (0, 0)、B1 遠遠站著；旗子放遠處 */
function shooterState(): GameState {
  return makeState({ A1: { position: { x: 0, y: 0 } }, B1: { position: { x: 8, y: 8 } }, flag: FLAG_FAR_AWAY });
}

/** A1 原地往右開槍一回合，回傳結果 */
const fire = (state: GameState, config: CtfConfig = CTF_CONFIG) => resolveRound(state, { A1: shoot('right') }, config);

describe('第 5 節：原地連射與過熱（v0.7）', () => {
  it('原地連開三槍：射程依序是 3、2、1（第二槍打不到第 3 格、第三槍打不到第 2 格）', () => {
    // 第一槍：B1 在第 3 格 (3, 0)，射程 3 打得到
    let state = place(shooterState(), 'B1', { x: 3, y: 0 });
    let output = fire(state);
    expect(shotRange(output.events)).toBe(3);
    expect(shotEvents(output.events)[0]).toMatchObject({ hitId: 'B1' });
    expect(characterOf(output.state, 'A1').stationaryShots).toBe(1);

    // 第二槍：B1 還在第 3 格，射程 2 打不到
    output = fire(output.state);
    expect(shotRange(output.events)).toBe(2);
    expect(shotEvents(output.events)[0]).toMatchObject({ hitId: null, endPosition: { x: 2, y: 0 } });

    // 第三槍：B1 移到第 2 格 (2, 0)，射程 1 打不到
    state = place(output.state, 'B1', { x: 2, y: 0 });
    output = fire(state);
    expect(shotRange(output.events)).toBe(1);
    expect(shotEvents(output.events)[0]).toMatchObject({ hitId: null, endPosition: { x: 1, y: 0 } });
    expect(characterOf(output.state, 'A1').stationaryShots).toBe(3);
  });

  it('原地連開三槍後下一回合過熱：選射擊被當成不動、有不合法動作的事件；再下一回合可以開槍，射程 1', () => {
    let state = shooterState();
    for (let shot = 1; shot <= 3; shot++) {
      const output = fire(state);
      expect(output.events.some((event) => event.type === 'overheated'), `第 ${shot} 槍`).toBe(shot === 3);
      state = output.state;
    }
    expect(characterOf(state, 'A1')).toMatchObject({ stationaryShots: 3, overheated: true });
    expect(shootRangeOf(characterOf(state, 'A1'), CTF_CONFIG)).toBe(1);

    // 過熱這一回合：射擊被當成不動，沒有射擊事件；次數還是 3；結算完過熱解除
    const blocked = fire(state);
    expect(shotEvents(blocked.events)).toEqual([]);
    expect(blocked.events).toContainEqual(
      expect.objectContaining({ type: 'invalidAction', characterId: 'A1', reason: '過熱，這回合不能開槍' }),
    );
    expect(characterOf(blocked.state, 'A1')).toMatchObject({ stationaryShots: 3, overheated: false, position: { x: 0, y: 0 } });

    // 再下一回合：可以開槍，射程 1（B1 站在第 1 格被打中）
    const after = fire(place(blocked.state, 'B1', { x: 1, y: 0 }));
    expect(shotRange(after.events)).toBe(1);
    expect(shotEvents(after.events)[0]).toMatchObject({ hitId: 'B1' });
  });

  it('連開第 6 槍後再過熱一次（第 4 回合過熱、第 5 到 7 回合開槍）', () => {
    let state = shooterState();
    const overheatedAfter: number[] = [];
    for (let round = 1; round <= 7; round++) {
      const output = fire(state);
      if (output.events.some((event) => event.type === 'overheated')) overheatedAfter.push(round);
      state = output.state;
    }
    expect(overheatedAfter).toEqual([3, 7]);
    expect(characterOf(state, 'A1')).toMatchObject({ stationaryShots: 6, overheated: true });
  });

  it('開槍後成功移動一步：下一槍射程回到 3', () => {
    let state = fire(shooterState()).state;
    state = resolveRound(state, { A1: move('down') }).state;
    expect(characterOf(state, 'A1').stationaryShots).toBe(0);
    expect(shotRange(fire(state).events)).toBe(3);
  });

  it('開槍後不動一回合再開槍：射程 2（不動不會恢復）', () => {
    let state = fire(shooterState()).state;
    state = resolveRound(state, { A1: stay }).state;
    expect(characterOf(state, 'A1').stationaryShots).toBe(1);
    expect(shotRange(fire(state).events)).toBe(2);
  });

  it('開槍後移動但被彈回或撞牆：次數不變，下一槍射程 2', () => {
    // 撞牆：A1 在 (1, 3)，右邊 (2, 3) 是牆
    let wall = makeState({ A1: { position: { x: 1, y: 3 } }, B1: { position: { x: 8, y: 8 } }, flag: FLAG_FAR_AWAY });
    wall = resolveRound(wall, { A1: shoot('up') }).state;
    const bumped = resolveRound(wall, { A1: move('right') });
    expect(bumped.events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', reason: 'wall' }));
    expect(characterOf(bumped.state, 'A1').stationaryShots).toBe(1);
    expect(shotRange(resolveRound(bumped.state, { A1: shoot('up') }).events)).toBe(2);

    // 彈回：A1 和 B1 要走進同一格
    let bounce = makeState({ A1: { position: { x: 0, y: 0 } }, B1: { position: { x: 2, y: 0 } }, flag: FLAG_FAR_AWAY });
    bounce = resolveRound(bounce, { A1: shoot('down') }).state;
    const bounced = resolveRound(bounce, { A1: move('right'), B1: move('left') });
    expect(bounced.events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', characterId: 'A1', reason: 'sameTarget' }));
    expect(characterOf(bounced.state, 'A1').stationaryShots).toBe(1);
    expect(shotRange(resolveRound(bounced.state, { A1: shoot('down') }).events)).toBe(2);
  });

  it('射一槍、走一步輪流 6 回合：每一槍射程都是 3，沒有過熱', () => {
    let state = shooterState();
    const ranges: number[] = [];
    const steps = ['down', 'up', 'down'] as const;
    for (let round = 0; round < 6; round++) {
      const action: Action = round % 2 === 0 ? shoot('right') : move(steps[(round - 1) / 2]!);
      const output = resolveRound(state, { A1: action });
      const range = shotRange(output.events);
      if (range !== undefined) ranges.push(range);
      expect(output.events.some((event) => event.type === 'overheated')).toBe(false);
      state = output.state;
    }
    expect(ranges).toEqual([3, 3, 3]);
    expect(characterOf(state, 'A1').overheated).toBe(false);
  });

  it('過熱那一回合成功移動：次數歸零，下一槍射程 3', () => {
    let state = shooterState();
    for (let shot = 0; shot < 3; shot++) state = fire(state).state;
    expect(characterOf(state, 'A1').overheated).toBe(true);
    state = resolveRound(state, { A1: move('down') }).state;
    expect(characterOf(state, 'A1')).toMatchObject({ stationaryShots: 0, overheated: false });
    expect(shotRange(fire(state).events)).toBe(3);
  });

  it('倒地重生後次數是 0、沒有過熱', () => {
    // A1 原地連射兩次、剩 1 點生命；B1 在 (0, 2) 往上開槍打倒 A1
    let state = makeState({
      A1: { position: { x: 0, y: 0 }, hp: 1, stationaryShots: 2, overheated: false },
      B1: { position: { x: 0, y: 2 } },
      flag: FLAG_FAR_AWAY,
    });
    const knocked = resolveRound(state, { A1: shoot('right'), B1: shoot('up') });
    expect(knocked.events).toContainEqual(expect.objectContaining({ type: 'knockedDown', characterId: 'A1' }));
    // 第三槍本來會過熱，但同一回合倒地：次數歸零、沒有過熱
    expect(characterOf(knocked.state, 'A1')).toMatchObject({ position: null, stationaryShots: 0, overheated: false });
    expect(knocked.events.some((event) => event.type === 'overheated' && event.characterId === 'A1')).toBe(false);

    state = knocked.state;
    for (let round = 0; round < 2; round++) state = resolveRound(state, {}).state;
    expect(characterOf(state, 'A1')).toMatchObject({ position: { x: 0, y: 4 }, stationaryShots: 0, overheated: false });
  });

  it('射擊事件帶著這一槍的射程；過熱時有「過熱」事件', () => {
    let state = shooterState();
    const all: GameEvent[] = [];
    for (let shot = 0; shot < 3; shot++) {
      const output = fire(state);
      all.push(...output.events);
      state = output.state;
    }
    expect(shotEvents(all).map((event) => (event.type === 'shot' ? event.range : null))).toEqual([3, 2, 1]);
    expect(all).toContainEqual({ type: 'overheated', characterId: 'A1' });
  });

  it('開關關掉：原地連開五槍射程都是 3、沒有過熱、次數一直是 0', () => {
    const config: CtfConfig = { ...CTF_CONFIG, stationaryShotPenalty: false };
    let state = shooterState();
    for (let shot = 0; shot < 5; shot++) {
      const output = fire(state, config);
      expect(shotRange(output.events)).toBe(3);
      expect(output.events.some((event) => event.type === 'overheated' || event.type === 'invalidAction')).toBe(false);
      state = output.state;
      expect(characterOf(state, 'A1')).toMatchObject({ stationaryShots: 0, overheated: false });
    }
  });

  it('過熱門檻設成 0：射程照樣變短，但不會過熱', () => {
    const config: CtfConfig = { ...CTF_CONFIG, overheatThreshold: 0 };
    let state = shooterState();
    const ranges: number[] = [];
    for (let shot = 0; shot < 7; shot++) {
      const output = fire(state, config);
      ranges.push(shotRange(output.events)!);
      expect(output.events.some((event) => event.type === 'overheated' || event.type === 'invalidAction')).toBe(false);
      state = output.state;
    }
    expect(ranges).toEqual([3, 2, 1, 1, 1, 1, 1]);
    expect(characterOf(state, 'A1').overheated).toBe(false);
  });

  it('共用的「這個角色現在的射程」：射擊距離減原地連射次數，最少是最短射程', () => {
    expect([0, 1, 2, 3, 9].map((stationaryShots) => shootRangeOf({ stationaryShots }, CTF_CONFIG))).toEqual([3, 2, 1, 1, 1]);
    expect(shootRangeOf({ stationaryShots: 2 }, { ...CTF_CONFIG, stationaryShotPenalty: false })).toBe(3);
    expect(shootRangeOf({ stationaryShots: 2 }, { ...CTF_CONFIG, minShootRange: 2 })).toBe(2);
  });

  it('給 AI 腳本看的場面裡有原地連射次數、過熱、旗子閒置回合數', () => {
    const state = makeState({
      A1: { position: { x: 0, y: 0 }, stationaryShots: 2, overheated: true },
      flag: { status: 'onGround', position: { x: 4, y: 4 } },
      flagIdleRounds: 7,
    });
    const view = getCharacterView(state, 'B1');
    expect(view.state.characters.find((character) => character.id === 'A1')).toMatchObject({ stationaryShots: 2, overheated: true });
    expect(view.state.flagIdleRounds).toBe(7);
    // 開場：次數 0、沒有過熱、閒置 0
    const opening = getCharacterView(createInitialState(), 'A1');
    expect(opening.state.characters.every((character) => character.stationaryShots === 0 && !character.overheated)).toBe(true);
    expect(opening.state.flagIdleRounds).toBe(0);
  });

  it('「得分後重新開局」打開時，回家的那一刻次數歸零、過熱解除', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 4 } },
      B1: { position: { x: 8, y: 8 }, stationaryShots: 2 },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    // B1 這回合第三槍，本來會過熱；A1 得分、雙方回家
    const { state: next } = resolveRound(state, { A1: move('left'), B1: shoot('up') }, { ...CTF_CONFIG, resetOnScore: true });
    expect(characterOf(next, 'B1')).toMatchObject({ position: { x: 8, y: 4 }, stationaryShots: 0, overheated: false });
  });
});

describe('第 5 節：旗子重抽（v0.7）', () => {
  /** 旗子這回合出現在 (4, 4)（9×9 固定地圖，種子 1），兩個角色在角落不動 */
  function flagJustAppeared(): GameState {
    const before = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 8, y: 8 } },
      flag: { status: 'announced', roundsLeft: 1, nextPosition: { x: 4, y: 4 } },
    });
    const { state, events } = resolveRound(before, {});
    expect(events).toContainEqual({ type: 'flagAppeared', position: { x: 4, y: 4 } });
    expect(state.flagIdleRounds).toBe(0);
    return state;
  }

  it('旗子出現後 20 回合沒人撿：第 20 回合結算完變成「隱藏，剩 2 回合」、有「旗子重抽」事件；之後第 2 回合結算完進入預告、第 4 回合結算完出現', () => {
    let state = flagJustAppeared();
    for (let round = 1; round <= 19; round++) {
      state = resolveRound(state, {}).state;
      expect(state.flagIdleRounds).toBe(round);
      expect(state.flag.status).toBe('onGround');
    }
    const rerolled = resolveRound(state, {});
    expect(rerolled.events).toContainEqual({ type: 'flagRerolled', position: { x: 4, y: 4 } });
    expect(rerolled.state.flag).toEqual({ status: 'hidden', roundsLeft: 2 }); // 這一回合不減隱藏的回合數
    expect(rerolled.state.flagIdleRounds).toBe(0);

    state = resolveRound(rerolled.state, {}).state;
    expect(state.flag).toEqual({ status: 'hidden', roundsLeft: 1 });
    state = resolveRound(state, {}).state;
    expect(state.flag).toMatchObject({ status: 'announced', roundsLeft: 2 });
    state = resolveRound(state, {}).state;
    state = resolveRound(state, {}).state;
    expect(state.flag.status).toBe('onGround');
  });

  it('重抽後的新位置不是剛消失的那一格，而且和照第 5 節算法手算的結果一致（種子 1、9×9 固定地圖）', () => {
    // 手算（另外用 Python 照 mulberry32 算過）：
    // 第 1 次抽：亂數 0.627074 × 7 格 → 第 4 個 = (4, 5)，第 4 回合結算完出現
    // 第 2 次抽（重抽後）：亂數 0.002736 × 6 格（去掉 (4, 5)）→ 第 0 個 = (4, 0)
    let state = createInitialState(CTF_CONFIG, 1, CLASSIC_MAP_9X9);
    const history: { round: number; events: GameEvent[] }[] = [];
    while (state.round < 28) {
      const output = resolveRound(state, {}); // 兩個角色都站在家裡不動，沒有人撿旗
      state = output.state;
      history.push({ round: state.round, events: output.events });
    }
    const roundOf = (type: GameEvent['type']) => history.filter((entry) => entry.events.some((event) => event.type === type)).map((entry) => entry.round);
    expect(roundOf('flagAppeared')).toEqual([4, 28]);
    expect(roundOf('flagRerolled')).toEqual([24]); // 第 5 回合結算完閒置 1，…，第 24 回合結算完閒置 20
    expect(history.find((entry) => entry.round === 24)!.events).toContainEqual({ type: 'flagRerolled', position: { x: 4, y: 5 } });
    expect(state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 0 } });
    expect(state.lastFlagSpawn).toEqual({ x: 4, y: 0 });
  });

  it('閒置到第 10 回合時有人撿起：閒置回合數歸零', () => {
    let state = place(flagJustAppeared(), 'A1', { x: 3, y: 4 });
    for (let round = 0; round < 10; round++) state = resolveRound(state, {}).state;
    expect(state.flagIdleRounds).toBe(10);
    const picked = resolveRound(state, { A1: move('right') });
    expect(picked.state.flag).toEqual({ status: 'carried', carrierId: 'A1' });
    expect(picked.state.flagIdleRounds).toBe(0);
  });

  it('拿著旗子時閒置回合數照加，但不會重抽（拿著 25 回合旗子還在手上）', () => {
    let state = makeState({ A1: { position: { x: 2, y: 2 } }, B1: { position: { x: 8, y: 8 } }, flag: { status: 'carried', carrierId: 'A1' } });
    for (let round = 1; round <= 25; round++) {
      const output = resolveRound(state, {});
      expect(output.events.some((event) => event.type === 'flagRerolled')).toBe(false);
      state = output.state;
      expect(state.flagIdleRounds).toBe(round);
    }
    expect(state.flag).toEqual({ status: 'carried', carrierId: 'A1' });
  });

  it('拿著旗子超過 20 回合後被打掉旗子：那一回合結算完旗子重抽', () => {
    const state = makeState({
      A1: { position: { x: 2, y: 2 } },
      B1: { position: { x: 2, y: 0 } }, // 在 A1 上面兩格往下開槍
      flag: { status: 'carried', carrierId: 'A1' },
      flagIdleRounds: 22,
    });
    const { state: next, events } = resolveRound(state, { B1: shoot('down') });
    expect(events).toContainEqual(expect.objectContaining({ type: 'flagDropped', reason: 'hit', position: { x: 2, y: 2 } }));
    expect(events).toContainEqual({ type: 'flagRerolled', position: { x: 2, y: 2 } });
    expect(next.flag).toEqual({ status: 'hidden', roundsLeft: 2 });
    expect(next.flagIdleRounds).toBe(0);
  });

  it('持旗者被打掉旗子、自己放下旗子：閒置回合數不歸零', () => {
    const hit = makeState({
      A1: { position: { x: 2, y: 2 } },
      B1: { position: { x: 2, y: 0 } }, // 在 A1 上面兩格往下開槍
      flag: { status: 'carried', carrierId: 'A1' },
      flagIdleRounds: 5,
    });
    const afterHit = resolveRound(hit, { B1: shoot('down') }).state;
    expect(afterHit.flag.status).toBe('onGround');
    expect(afterHit.flagIdleRounds).toBe(6);

    const dropped = makeState({ A1: { position: { x: 2, y: 2 } }, flag: { status: 'carried', carrierId: 'A1' }, flagIdleRounds: 5 });
    const afterDrop = resolveRound(dropped, { A1: dropFlag }).state;
    expect(afterDrop.flag.status).toBe('onGround');
    expect(afterDrop.flagIdleRounds).toBe(6);
  });

  it('隱藏和預告階段閒置回合數是 0', () => {
    let state = createInitialState(CTF_CONFIG, 3, CLASSIC_MAP_9X9);
    for (let round = 1; round <= 4; round++) {
      state = resolveRound(state, {}).state;
      expect(state.flagIdleRounds, `第 ${round} 回合（${state.flag.status}）`).toBe(0);
    }
    expect(state.flag.status).toBe('onGround'); // 第 4 回合結算完出現，閒置 0
    // 就算場面上原本帶著數字，進入隱藏或預告的回合結算完也是 0
    const odd = makeState({ flag: { status: 'announced', roundsLeft: 2, nextPosition: { x: 4, y: 4 } }, flagIdleRounds: 9 });
    expect(resolveRound(odd, {}).state.flagIdleRounds).toBe(0);
  });

  it('設成 0：旗子放 50 回合也不會重抽，閒置回合數永遠是 0', () => {
    const config: CtfConfig = { ...CTF_CONFIG, flagRerollRounds: 0 };
    let state = flagJustAppeared();
    for (let round = 0; round < 50; round++) {
      const output = resolveRound(state, {}, config);
      expect(output.events.some((event) => event.type === 'flagRerolled')).toBe(false);
      state = output.state;
      expect(state.flagIdleRounds).toBe(0);
    }
    expect(state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 4 } });
  });

  it('延長賽中照常計算', () => {
    let state = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 8, y: 8 } },
      flag: { status: 'onGround', position: { x: 4, y: 4 } },
      phase: 'overtime',
      round: 210,
      flagIdleRounds: 18,
    });
    state = resolveRound(state, {}).state;
    expect(state.flagIdleRounds).toBe(19);
    const { state: next, events } = resolveRound(state, {});
    expect(events).toContainEqual({ type: 'flagRerolled', position: { x: 4, y: 4 } });
    expect(next.flag).toEqual({ status: 'hidden', roundsLeft: 2 });
    expect(next.phase).toBe('overtime');
  });
});

describe('第 8 節：AI（v0.7）', () => {
  const NO_CHANCE: CtfConfig = {
    ...CTF_CONFIG,
    bots: { attackerAimAtCurrentChance: 0, attackerSkipShootingChance: 0, flagRunnerStayChance: 0 },
  };
  const AI_SEEDS = Array.from({ length: 20 }, (_, index) => index * 7919 + 3);

  it('攻擊型（兩個機率設成 0）：原地連射次數是 1、對手下一步會走到第 3 格時不射擊；走到第 2 格時射擊', () => {
    // B1 在 (5, 2) 往旗子 (5, 4) 走，唯一的最短路第一步是 (5, 3)
    const third = makeState({
      A1: { position: { x: 5, y: 6 }, stationaryShots: 1 }, // (5, 3) 在第 3 格，射程只剩 2
      B1: { position: { x: 5, y: 2 } },
      flag: { status: 'onGround', position: { x: 5, y: 4 } },
    });
    const second = makeState({
      A1: { position: { x: 5, y: 5 }, stationaryShots: 1 }, // (5, 3) 在第 2 格
      B1: { position: { x: 5, y: 2 } },
      flag: { status: 'onGround', position: { x: 5, y: 4 } },
    });
    for (const aiSeed of AI_SEEDS) {
      expect(createAttacker(aiSeed, NO_CHANCE)(getCharacterView(third, 'A1')).type).not.toBe('shoot');
      expect(createAttacker(aiSeed, NO_CHANCE)(getCharacterView(second, 'A1'))).toEqual({ type: 'shoot', direction: 'up' });
    }
    // 同一個場面次數是 0（射程 3）時會射擊：確認上面是射程造成的
    const fresh = place(third, 'A1', { x: 5, y: 6 });
    characterOf(fresh, 'A1').stationaryShots = 0;
    expect(createAttacker(1, NO_CHANCE)(getCharacterView(fresh, 'A1'))).toEqual({ type: 'shoot', direction: 'up' });
  });

  it('攻擊型：過熱時不射擊', () => {
    const state = makeState({
      A1: { position: { x: 5, y: 5 }, stationaryShots: 3, overheated: true },
      B1: { position: { x: 5, y: 4 } },
      flag: FLAG_FAR_AWAY,
    });
    const config: CtfConfig = { ...NO_CHANCE, bots: { ...NO_CHANCE.bots, attackerAimAtCurrentChance: 1 } };
    for (const aiSeed of AI_SEEDS) {
      expect(createAttacker(aiSeed, config)(getCharacterView(state, 'A1')).type).not.toBe('shoot');
    }
  });

  it('Codex：過熱的角色沒有射擊這個選項；射擊選項照開槍者現在的射程', () => {
    const state = makeState({
      map: createInitialState(CTF_CONFIG, 1).map,
      A1: { position: { x: 1, y: 2 } },
      B1: { position: { x: 4, y: 2 } }, // 在 A1 右邊第 3 格
      flag: { status: 'onGround', position: { x: 5, y: 8 } },
    });
    const geo = createGeometry(state.map, CTF_CONFIG.shootRange);
    const canShootRight = (s: GameState) =>
      legalActions(s, characterOf(s, 'A1'), geo, CTF_CONFIG).some((action) => action.type === 'shoot' && action.direction === 'right');
    expect(canShootRight(state)).toBe(true); // 射程 3：B1 和他下一步都可能在線上
    const tired = structuredClone(state);
    characterOf(tired, 'A1').stationaryShots = 2; // 射程 1：B1 和他下一步都不在線上
    expect(canShootRight(tired)).toBe(false);
    const hot = structuredClone(state);
    characterOf(hot, 'A1').overheated = true;
    expect(legalActions(hot, characterOf(hot, 'A1'), geo, CTF_CONFIG).some((action) => action.type === 'shoot')).toBe(false);
    for (const aiSeed of AI_SEEDS) expect(createCodex(aiSeed)(getCharacterView(hot, 'A1')).type).not.toBe('shoot');
  });

  it('Codex：跑 50 場（對攻擊型、兩隊輪替），沒有任何一步是不合法的動作，過熱時不會選射擊（v0.7；v0.8 整排得分下一樣通過）', () => {
    let overheatedTurns = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const codexTeam = seed % 2 ? 'A' : 'B';
      const bots = createMatchBots(codexTeam === 'A' ? 'codex' : 'attacker', codexTeam === 'A' ? 'attacker' : 'codex', seed);
      let state = createInitialState(CTF_CONFIG, seed);
      while (!state.result) {
        const actions: ActionMap = {};
        for (const character of state.characters) {
          if (!character.position) continue;
          const action = bots[character.id]!(getCharacterView(state, character.id));
          if (character.team === codexTeam && character.overheated) {
            overheatedTurns++;
            expect(action.type, `種子 ${seed} 第 ${state.round + 1} 回合`).not.toBe('shoot');
          }
          actions[character.id] = action;
        }
        const output = resolveRound(state, actions);
        expect(output.events.filter((event) => event.type === 'invalidAction'), `種子 ${seed}`).toEqual([]);
        state = output.state;
      }
    }
    // 確認 50 場裡真的遇到過「Codex 過熱」的情況
    expect(overheatedTurns).toBeGreaterThan(0);
  }, 120000);
});

describe('positionOf 小工具', () => {
  it('place 只改複本', () => {
    const state = shooterState();
    const moved = place(state, 'A1', { x: 1, y: 1 });
    expect(positionOf(state, 'A1')).toEqual({ x: 0, y: 0 });
    expect(positionOf(moved, 'A1')).toEqual({ x: 1, y: 1 });
  });
});

describe('第 8 節：對打指令的輸出（v0.7）', () => {
  it('射程比射擊距離短時印出目前射程，過熱時印「過熱」；旗子重抽時印一行', () => {
    // 攻擊型對攻擊型、種子 1：會原地連射到過熱
    const attackers = runMatch('attacker', 'attacker', 1).lines;
    expect(attackers.some((line) => line.includes('（射程 2）'))).toBe(true);
    expect(attackers.some((line) => line.includes('（射程 1）（過熱）'))).toBe(true);
    expect(attackers).toContain('  · A1 的槍過熱了，下一回合不能開槍');
    // 射程 3 時不印
    expect(attackers.some((line) => line.includes('（射程 3）'))).toBe(false);
    // 搶旗對搶旗、種子 35：旗子太久沒人撿（v0.8 整排得分後比賽過程變了，原本的種子 4 不再出現重抽）
    const runners = runMatch('runner', 'runner', 35).lines;
    expect(runners).toContain('  · 旗子太久沒人撿，從 (5, 0) 消失，重新抽位置');
  });
});
