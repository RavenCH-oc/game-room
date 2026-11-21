// v0.8：整排得分（規則第 2 節「得分排」、第 5 節步驟 4、第 8 節「回家」、第 9 節）

import { describe, expect, it } from 'vitest';
import { createAttacker, predictNextPosition } from '../bots/attacker.ts';
import { createRoundRandom } from '../bots/botRandom.ts';
import { createFlagRunner } from '../bots/flagRunner.ts';
import { homeTarget } from '../bots/pathfinding.ts';
import {
  CLASSIC_MAP_9X9,
  CTF_CONFIG,
  createInitialState,
  getCharacterView,
  isScoringCell,
  resolveRound,
  scoringCells,
  type Action,
  type Bot,
  type CtfConfig,
  type GameMap,
  type GameState,
} from '../core/index.ts';
import { characterOf, hpOf, makeState, move, positionOf, shoot, stay } from './helpers.ts';

const ROW_OFF: CtfConfig = { ...CTF_CONFIG, wholeRowScoring: false };
const column = (x: number, ys: number[]) => ys.map((y) => ({ x, y }));

describe('第 2 節、第 5 節步驟 4：得分排（v0.8）', () => {
  it('帶旗踏進自己得分排上不是重生點的格子：得分、旗子進入隱藏', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, flag: { status: 'carried', carrierId: 'A1' } });
    const { state: next, events } = resolveRound(state, { A1: move('left') });
    expect(positionOf(next, 'A1')).toEqual({ x: 0, y: 0 });
    expect(next.scores).toEqual({ A: 1, B: 0 });
    expect(next.flag).toEqual({ status: 'hidden', roundsLeft: 2 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'scored', characterId: 'A1', team: 'A' }));
  });

  it('帶旗踏進「對方的」得分排：不得分', () => {
    const state = makeState({
      A1: { position: { x: 7, y: 0 } },
      B1: { position: { x: 8, y: 8 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next } = resolveRound(state, { A1: move('right') });
    expect(positionOf(next, 'A1')).toEqual({ x: 8, y: 0 });
    expect(next.scores).toEqual({ A: 0, B: 0 });
    expect(next.flag).toEqual({ status: 'carried', carrierId: 'A1' });
  });

  it('沒拿旗的人站在自己的得分格上：不得分', () => {
    let state = makeState({ A1: { position: { x: 1, y: 0 } }, flag: { status: 'onGround', position: { x: 4, y: 4 } } });
    state = resolveRound(state, { A1: move('left') }).state;
    state = resolveRound(state, { A1: stay }).state;
    expect(positionOf(state, 'A1')).toEqual({ x: 0, y: 0 });
    expect(state.scores).toEqual({ A: 0, B: 0 });
  });

  it('對手可以走進得分排上不是重生點的格子；走向對方重生點還是留在原位', () => {
    const state = makeState({
      A1: { position: { x: 8, y: 8 } },
      B1: { position: { x: 1, y: 0 } },
      extra: [{ id: 'B2', team: 'B', position: { x: 1, y: 4 } }],
      flag: { status: 'onGround', position: { x: 4, y: 4 } },
    });
    const { state: next, events } = resolveRound(state, { B1: move('left'), B2: move('left') });
    expect(positionOf(next, 'B1')).toEqual({ x: 0, y: 0 }); // A 隊得分排上的普通格子
    expect(positionOf(next, 'B2')).toEqual({ x: 1, y: 4 }); // (0, 4) 是 A 隊重生點
    expect(events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', characterId: 'B2', reason: 'enemySpawn' }));
  });

  it('帶旗踏進得分格的那一回合被射擊：照樣得分，另外扣生命值', () => {
    // A1 拿旗從 (1, 0) 走進 (0, 0)；B1 在 (0, 2) 往上開槍，打到移動後的 A1
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 0, y: 2 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next, events } = resolveRound(state, { A1: move('left'), B1: shoot('up') });
    expect(next.scores.A).toBe(1);
    expect(hpOf(next, 'A1')).toBe(2);
    expect(next.flag.status).toBe('hidden');
    expect(events.some((event) => event.type === 'flagDropped')).toBe(false);
  });

  it('旗子掉在自己的得分格上，走進去撿起的那一回合就得分', () => {
    const state = makeState({ A1: { position: { x: 1, y: 2 } }, flag: { status: 'onGround', position: { x: 0, y: 2 } } });
    const { state: next, events } = resolveRound(state, { A1: move('left') });
    expect(events).toContainEqual(expect.objectContaining({ type: 'flagPickedUp', characterId: 'A1' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'scored', characterId: 'A1' }));
    expect(next.scores.A).toBe(1);
    expect(next.flag.status).toBe('hidden');
  });

  it('得分排上的牆走不進去（種子 1 的地圖：(0, 8) 是牆）；種子 1 A 隊的得分格是 (0, 0) 到 (0, 7) 和 (0, 9)', () => {
    const map = createInitialState(CTF_CONFIG, 1).map;
    expect(scoringCells('A', map, CTF_CONFIG)).toEqual(column(0, [0, 1, 2, 3, 4, 5, 6, 7, 9]));
    expect(isScoringCell({ x: 0, y: 8 }, 'A', map, CTF_CONFIG)).toBe(false);
    expect(isScoringCell({ x: 0, y: 10 }, 'A', map, CTF_CONFIG)).toBe(false);

    // A1（沒拿旗）站在 (0, 7) 往下走：(0, 8) 是牆，留在原位
    const state = makeState({ map, A1: { position: { x: 0, y: 7 } }, B1: { position: { x: 10, y: 0 } }, flag: { status: 'onGround', position: { x: 5, y: 2 } } });
    const { state: next, events } = resolveRound(state, { A1: move('down') });
    expect(positionOf(next, 'A1')).toEqual({ x: 0, y: 7 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', characterId: 'A1', reason: 'wall' }));
  });

  it('開關關掉：帶旗踏進得分排上不是重生點的格子不得分，走到重生點才得分', () => {
    let state = makeState({ A1: { position: { x: 1, y: 3 } }, flag: { status: 'carried', carrierId: 'A1' } });
    state = resolveRound(state, { A1: move('left') }, ROW_OFF).state;
    expect(positionOf(state, 'A1')).toEqual({ x: 0, y: 3 });
    expect(state.scores.A).toBe(0);
    expect(state.flag).toEqual({ status: 'carried', carrierId: 'A1' });
    state = resolveRound(state, { A1: move('down') }, ROW_OFF).state;
    expect(positionOf(state, 'A1')).toEqual({ x: 0, y: 4 });
    expect(state.scores.A).toBe(1);
    // 開關關掉時得分格只有重生點
    expect(scoringCells('A', CLASSIC_MAP_9X9, ROW_OFF)).toEqual([{ x: 0, y: 4 }]);
    expect(isScoringCell({ x: 0, y: 3 }, 'A', CLASSIC_MAP_9X9, ROW_OFF)).toBe(false);
  });

  it('用固定的 9×9 地圖：得分排是 x = 0 和 x = 8', () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    expect(scoringCells('A', CLASSIC_MAP_9X9, CTF_CONFIG)).toEqual(column(0, all));
    expect(scoringCells('B', CLASSIC_MAP_9X9, CTF_CONFIG)).toEqual(column(8, all));
    expect(isScoringCell({ x: 1, y: 4 }, 'A', CLASSIC_MAP_9X9, CTF_CONFIG)).toBe(false);
    expect(isScoringCell({ x: 8, y: 0 }, 'A', CLASSIC_MAP_9X9, CTF_CONFIG)).toBe(false);
    expect(isScoringCell({ x: 8, y: 0 }, 'B', CLASSIC_MAP_9X9, CTF_CONFIG)).toBe(true);
    // B 隊帶旗踏進 (8, 0) 得分
    const state = makeState({ A1: { position: { x: 0, y: 8 } }, B1: { position: { x: 7, y: 0 } }, flag: { status: 'carried', carrierId: 'B1' } });
    expect(resolveRound(state, { B1: move('right') }).state.scores).toEqual({ A: 0, B: 1 });
  });

  it('11×11 隨機地圖：每隊至少有 5 個得分格（重生點上下各 2 格一定不是牆），種子 1 到 200 都檢查', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const map = createInitialState(CTF_CONFIG, seed).map;
      for (const team of ['A', 'B'] as const) {
        const cells = scoringCells(team, map, CTF_CONFIG);
        expect(cells.length, `種子 ${seed} ${team} 隊`).toBeGreaterThanOrEqual(5);
        const spawn = map.spawnPoints[team];
        for (let dy = -2; dy <= 2; dy++) expect(cells).toContainEqual({ x: spawn.x, y: spawn.y + dy });
      }
    }
  });
});

describe('第 8 節：範例 AI 的「回家」（v0.8）', () => {
  const NO_CHANCE: CtfConfig = {
    ...CTF_CONFIG,
    bots: { attackerAimAtCurrentChance: 0, attackerSkipShootingChance: 0, flagRunnerStayChance: 0 },
  };
  const AI_SEEDS = Array.from({ length: 30 }, (_, index) => index * 7919 + 3);
  const directions = (create: (aiSeed: number) => Bot, state: GameState): Set<string> =>
    new Set(
      AI_SEEDS.map((aiSeed) => {
        const action: Action = create(aiSeed)(getCharacterView(state, 'A1'));
        return action.type === 'move' ? action.direction : action.type;
      }),
    );
  const bots = [
    { name: '搶旗', create: (aiSeed: number, config: CtfConfig) => createFlagRunner(aiSeed, config) },
    { name: '攻擊型', create: (aiSeed: number, config: CtfConfig) => createAttacker(aiSeed, config) },
  ];

  it('搶旗和攻擊型拿著旗時往最近的得分格走：站在 (3, 1) 拿著旗（A 隊、沒有牆擋路）會往 (0, 1) 走，不是往 (0, 5)', () => {
    // 11×11 的空地圖（只有重生點），A 隊重生點 (0, 5)
    const open: GameMap = { width: 11, height: 11, spawnPoints: { A: { x: 0, y: 5 }, B: { x: 10, y: 5 } }, walls: [] };
    const state = makeState({
      map: open,
      A1: { position: { x: 3, y: 1 } },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    expect(homeTarget({ x: 3, y: 1 }, 'A', open, CTF_CONFIG)).toEqual({ x: 0, y: 1 });
    for (const bot of bots) {
      // 往 (0, 1) 只有往左一條最短路；往 (0, 5) 的話往下也會出現
      expect(directions((aiSeed) => bot.create(aiSeed, NO_CHANCE), state), bot.name).toEqual(new Set(['left']));
    }
  });

  it('一樣近時選重生點；開關關掉時往重生點走', () => {
    // (0, 3) 是牆：從 (1, 3) 到重生點 (0, 4) 和到 (0, 2) 都是 2 步 → 選重生點，往下走
    const tie: GameMap = { ...CLASSIC_MAP_9X9, walls: [{ x: 0, y: 3 }] };
    expect(homeTarget({ x: 1, y: 3 }, 'A', tie, CTF_CONFIG)).toEqual({ x: 0, y: 4 });
    const tieState = makeState({
      map: tie,
      A1: { position: { x: 1, y: 3 } },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    for (const bot of bots) {
      expect(directions((aiSeed) => bot.create(aiSeed, NO_CHANCE), tieState), bot.name).toEqual(new Set(['down']));
    }
    // 重生點不在一樣近的格子裡時選 y 最小的：(1, 2) 是牆，從 (2, 2) 到 (0, 1) 和 (0, 3) 都是 3 步（重生點 (0, 4) 要 4 步）→ 選 (0, 1)
    expect(homeTarget({ x: 2, y: 2 }, 'A', { ...CLASSIC_MAP_9X9, walls: [{ x: 1, y: 2 }] }, CTF_CONFIG)).toEqual({ x: 0, y: 1 });

    // 開關關掉：(3, 1) 往重生點 (0, 4) 走，往左、往下都一樣短
    const far = makeState({
      A1: { position: { x: 3, y: 1 } },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    expect(homeTarget({ x: 3, y: 1 }, 'A', CLASSIC_MAP_9X9, ROW_OFF)).toEqual({ x: 0, y: 4 });
    for (const bot of bots) {
      expect(directions((aiSeed) => bot.create(aiSeed, { ...NO_CHANCE, wholeRowScoring: false }), far), bot.name).toEqual(
        new Set(['left', 'down']),
      );
      // 開關打開時同一個場面只往左（最近的是 (0, 1)）
      expect(directions((aiSeed) => bot.create(aiSeed, NO_CHANCE), far), bot.name).toEqual(new Set(['left']));
    }
  });

  it('攻擊型猜持旗的對手時，猜他往「他最近的得分格」走一步', () => {
    // B1 拿旗在 (5, 1)：最近的 B 隊得分格是 (8, 1)，猜他往右到 (6, 1)
    const state = makeState({
      A1: { position: { x: 6, y: 3 } },
      B1: { position: { x: 5, y: 1 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    for (const aiSeed of AI_SEEDS) {
      const guess = predictNextPosition(state, characterOf(state, 'B1'), { x: 6, y: 3 }, createRoundRandom(aiSeed, 0, 'A1'), CTF_CONFIG);
      expect(guess).toEqual({ x: 6, y: 1 });
      // A1 在 (6, 3)，(6, 1) 在往上 2 格：攻擊型（機率設成 0）會往上射
      expect(createAttacker(aiSeed, NO_CHANCE)(getCharacterView(state, 'A1'))).toEqual({ type: 'shoot', direction: 'up' });
    }
    // 開關關掉時「他家」是重生點 (8, 4)：往右或往下
    const guesses = new Set(
      AI_SEEDS.map((aiSeed) => {
        const guess = predictNextPosition(state, characterOf(state, 'B1'), { x: 6, y: 3 }, createRoundRandom(aiSeed, 0, 'A1'), ROW_OFF);
        return `${guess.x},${guess.y}`;
      }),
    );
    expect(guesses).toEqual(new Set(['6,1', '5,2']));
  });
});
