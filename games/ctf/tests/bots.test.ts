import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createAttacker, predictNextPosition } from '../bots/attacker.ts';
import { createRoundRandom, deriveAiSeed } from '../bots/botRandom.ts';
import { createFlagRunner } from '../bots/flagRunner.ts';
import { createBot } from '../bots/index.ts';
import { shootingDirection, standbyPoint } from '../bots/pathfinding.ts';
import { createRandomWalker } from '../bots/randomWalker.ts';
import { playMatch } from '../scripts/matchRunner.ts';
import {
  CLASSIC_MAP_9X9,
  CTF_CONFIG,
  createInitialState,
  fnv1a,
  getCharacterView,
  type Action,
  type Bot,
  type CtfConfig,
  type GameMap,
  type GameState,
} from '../core/index.ts';
import { FLAG_FAR_AWAY, makeState } from './helpers.ts';

/** 把機率設成指定的值（v0.5 第 9 節：攻擊型的三條測試把兩個機率設成 0 來測） */
function withChances(chances: Partial<CtfConfig['bots']>): CtfConfig {
  return { ...CTF_CONFIG, bots: { ...CTF_CONFIG.bots, ...chances } };
}
const NO_CHANCE = withChances({ attackerAimAtCurrentChance: 0, attackerSkipShootingChance: 0, flagRunnerStayChance: 0 });

/** 用來確認「不管 AI 種子是多少都這樣做」的一批 AI 種子 */
const AI_SEEDS = Array.from({ length: 40 }, (_, index) => index * 7919 + 3);

const decide = (bot: Bot, state: GameState, id = 'A1'): Action => bot(getCharacterView(state, id));

/** 每個 AI 種子各做一次決定，回傳全部的動作 */
function decideWithEverySeed(create: (aiSeed: number) => Bot, state: GameState, id = 'A1'): Action[] {
  return AI_SEEDS.map((aiSeed) => decide(create(aiSeed), state, id));
}

const moveDirection = (action: Action): string | null => (action.type === 'move' ? action.direction : null);

describe('第 8 節：範例 AI 共用規定（v0.5）', () => {
  it('AI 種子由比賽種子和角色 id 算出：fnv1a("ai:<比賽種子>:<角色 id>")', () => {
    expect(deriveAiSeed(1, 'B1')).toBe(fnv1a('ai:1:B1'));
    expect(deriveAiSeed(1, 'A1')).not.toBe(deriveAiSeed(1, 'B1'));
    expect(deriveAiSeed(1, 'B1')).not.toBe(deriveAiSeed(2, 'B1'));
    // FNV-1a 的標準測試值：空字串是 2166136261、"a" 是 0xe40c292c
    expect(fnv1a('')).toBe(2166136261);
    expect(fnv1a('a')).toBe(0xe40c292c);
  });

  it('AI 不記東西：每回合的亂數只由（AI 種子、回合數、角色 id）決定', () => {
    const first = createRoundRandom(123, 5, 'B1');
    const second = createRoundRandom(123, 5, 'B1');
    const firstValues = [first(), first(), first()];
    expect([second(), second(), second()]).toEqual(firstValues);
    expect(createRoundRandom(123, 6, 'B1')()).not.toBe(firstValues[0]);
    expect(createRoundRandom(124, 5, 'B1')()).not.toBe(firstValues[0]);
    expect(createRoundRandom(123, 5, 'A1')()).not.toBe(firstValues[0]);
  });

  it('同樣的場面和同一個 AI 種子，回傳的動作一樣（同一個 AI 問兩次也一樣）', () => {
    const state = makeState({
      A1: { position: { x: 4, y: 0 } },
      B1: { position: { x: 8, y: 8 } },
      flag: { status: 'onGround', position: { x: 4, y: 2 } },
    });
    for (const create of [createAttacker, createFlagRunner, createRandomWalker]) {
      for (const aiSeed of AI_SEEDS) {
        const bot = create(aiSeed);
        expect(decide(bot, state)).toEqual(decide(bot, state));
        expect(decide(create(aiSeed), state)).toEqual(decide(bot, state));
      }
    }
  });

  it('換 AI 種子，在「有兩條一樣短的路」的場面會出現不同的走法', () => {
    // A1 在 (4, 0)，旗子在 (4, 2)，中間 (4, 1) 是牆：往左繞、往右繞一樣短
    const state = makeState({
      A1: { position: { x: 4, y: 0 } },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'onGround', position: { x: 4, y: 2 } },
    });
    for (const create of [createAttacker, createFlagRunner]) {
      const directions = new Set(decideWithEverySeed((aiSeed) => create(aiSeed, NO_CHANCE), state).map(moveDirection));
      expect(directions).toEqual(new Set(['left', 'right']));
    }
  });

  it('待命點：9×9 固定地圖是 A 隊 (3, 4)、B 隊 (5, 4)（中線旁邊靠自己家的直行、離中間橫排最近）', () => {
    expect(standbyPoint('A', CLASSIC_MAP_9X9)).toEqual({ x: 3, y: 4 });
    expect(standbyPoint('B', CLASSIC_MAP_9X9)).toEqual({ x: 5, y: 4 });
  });

  it('v0.6 待命點照新的定義：種子 1 的地圖是 (4, 4)、(6, 4)；種子 2 的地圖是 (4, 5)、(6, 5)', () => {
    const map1 = createInitialState(CTF_CONFIG, 1).map;
    expect(standbyPoint('A', map1)).toEqual({ x: 4, y: 4 }); // (4, 5) 是牆，(4, 4) 和 (4, 6) 一樣近，選 y 小的
    expect(standbyPoint('B', map1)).toEqual({ x: 6, y: 4 });
    const map2 = createInitialState(CTF_CONFIG, 2).map;
    expect(standbyPoint('A', map2)).toEqual({ x: 4, y: 5 });
    expect(standbyPoint('B', map2)).toEqual({ x: 6, y: 5 });
  });

  it('v0.6 待命點：那一直行全部是牆時，待命點是自己的重生點', () => {
    const walls = Array.from({ length: 9 }, (_, y) => ({ x: 3, y }));
    const map: GameMap = { ...CLASSIC_MAP_9X9, walls };
    expect(standbyPoint('A', map)).toEqual({ x: 0, y: 4 });
  });

  it('隱藏階段：AI 往待命點走，到了不動', () => {
    const away = makeState({
      A1: { position: { x: 0, y: 4 } },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'hidden', roundsLeft: 2 },
    });
    const arrived = makeState({
      A1: { position: { x: 3, y: 4 } },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'hidden', roundsLeft: 1 },
    });
    for (const create of [createAttacker, createFlagRunner]) {
      for (const action of decideWithEverySeed((aiSeed) => create(aiSeed, NO_CHANCE), away)) {
        expect(action).toEqual({ type: 'move', direction: 'right' });
      }
      for (const action of decideWithEverySeed((aiSeed) => create(aiSeed, NO_CHANCE), arrived)) {
        expect(action).toEqual({ type: 'stay' });
      }
    }
  });

  it('預告階段：AI 停在離預告位置一步的地方；站在預告格上會走開', () => {
    const announced = { status: 'announced', roundsLeft: 2, nextPosition: { x: 4, y: 2 } } as const;
    const far = makeState({ A1: { position: { x: 2, y: 2 } }, B1: { position: null, respawnCountdown: 2 }, flag: announced });
    const oneStep = makeState({ A1: { position: { x: 3, y: 2 } }, B1: { position: null, respawnCountdown: 2 }, flag: announced });
    const onTop = makeState({ A1: { position: { x: 4, y: 2 } }, B1: { position: null, respawnCountdown: 2 }, flag: announced });
    for (const create of [createAttacker, createFlagRunner]) {
      const bot = (aiSeed: number) => create(aiSeed, NO_CHANCE);
      for (const action of decideWithEverySeed(bot, far)) expect(action).toEqual({ type: 'move', direction: 'right' });
      for (const action of decideWithEverySeed(bot, oneStep)) expect(action).toEqual({ type: 'stay' });
      // 站在預告格上：往旁邊能走的方向隨機走一步（(4, 1) 是牆，只能往下、左、右）
      const directions = new Set(decideWithEverySeed(bot, onTop).map(moveDirection));
      expect(directions.size).toBeGreaterThan(1);
      for (const direction of directions) expect(['down', 'left', 'right']).toContain(direction);
    }
  });

  it('旗子在地上：走最短路去撿；站在旗子上會往旁邊隨機走一步', () => {
    const toFlag = makeState({ A1: { position: { x: 2, y: 4 } }, B1: { position: null, respawnCountdown: 2 }, flag: { status: 'onGround', position: { x: 4, y: 4 } } });
    const onFlag = makeState({ A1: { position: { x: 4, y: 4 } }, B1: { position: null, respawnCountdown: 2 }, flag: { status: 'onGround', position: { x: 4, y: 4 } } });
    for (const create of [createAttacker, createFlagRunner]) {
      const bot = (aiSeed: number) => create(aiSeed, NO_CHANCE);
      for (const action of decideWithEverySeed(bot, toFlag)) expect(action).toEqual({ type: 'move', direction: 'right' });
      const directions = new Set(decideWithEverySeed(bot, onFlag).map(moveDirection));
      expect(directions.size).toBeGreaterThan(1);
      expect(directions.has(null)).toBe(false);
    }
  });
});

describe('第 8 節：攻擊型 AI（v0.5）', () => {
  it('對手下一步會走進射擊線時會射擊（兩個機率設成 0）', () => {
    // B1 在 (5, 2) 往旗子 (5, 4) 走，唯一的最短路第一步是 (5, 3)；A1 在 (5, 6) 往上 3 格剛好打得到
    // （B1 現在的位置離 A1 有 4 格，不在射程內）
    const state = makeState({
      A1: { position: { x: 5, y: 6 } },
      B1: { position: { x: 5, y: 2 } },
      flag: { status: 'onGround', position: { x: 5, y: 4 } },
    });
    for (const action of decideWithEverySeed((aiSeed) => createAttacker(aiSeed, NO_CHANCE), state)) {
      expect(action).toEqual({ type: 'shoot', direction: 'up' });
    }
  });

  it('對手下一步會走出射擊線時不射擊（兩個機率設成 0）', () => {
    // B1 現在就在 A1 的射擊線上 (3, 0)，但他會往下走向旗子 (3, 4)，猜他走到 (3, 1)
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'onGround', position: { x: 3, y: 4 } },
    });
    for (const action of decideWithEverySeed((aiSeed) => createAttacker(aiSeed, NO_CHANCE), state)) {
      expect(action.type).not.toBe('shoot');
    }
  });

  it('拿著旗時不射擊、往家走（兩個機率設成 0）', () => {
    // 對手就在旁邊的射擊線上，但自己拿著旗 → 往家 (0, 4) 走
    const state = makeState({
      A1: { position: { x: 3, y: 4 } },
      B1: { position: { x: 4, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    for (const action of decideWithEverySeed((aiSeed) => createAttacker(aiSeed, NO_CHANCE), state)) {
      expect(action).toEqual({ type: 'move', direction: 'left' });
    }
  });

  it('「改打現在位置」的機率設成 100% 時打現在位置', () => {
    // 和上面「走出射擊線」同一個場面：猜的位置不在線上，但現在的位置在
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'onGround', position: { x: 3, y: 4 } },
    });
    const config = withChances({ attackerAimAtCurrentChance: 1, attackerSkipShootingChance: 0 });
    for (const action of decideWithEverySeed((aiSeed) => createAttacker(aiSeed, config), state)) {
      expect(action).toEqual({ type: 'shoot', direction: 'right' });
    }
  });

  it('「不考慮開槍」的機率設成 100% 時不開槍', () => {
    // 對手就站在旁邊的射擊線上；「改打現在位置」也設成 100%，只要考慮開槍就一定會開槍
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 2, y: 0 } },
      flag: FLAG_FAR_AWAY,
    });
    const config = withChances({ attackerAimAtCurrentChance: 1, attackerSkipShootingChance: 1 });
    for (const action of decideWithEverySeed((aiSeed) => createAttacker(aiSeed, config), state)) {
      expect(action.type).not.toBe('shoot');
    }
  });

  it('猜法：對手拿著旗，猜他往他家走一步', () => {
    // B1 拿旗在(6, 0)，往家 (8, 4) 走：往下、往右都一樣短，隨機猜一個
    const state = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 6, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const guesses = AI_SEEDS.map((aiSeed) =>
      predictNextPosition(state, state.characters[1]!, { x: 0, y: 0 }, createRoundRandom(aiSeed, 0, 'A1')),
    );
    const keys = new Set(guesses.map((guess) => `${guess.x},${guess.y}`));
    expect(keys).toEqual(new Set(['6,1', '7,0']));
  });

  it('猜法：旗子在地上，猜他往旗子走一步', () => {
    const state = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 5, y: 2 } },
      flag: { status: 'onGround', position: { x: 5, y: 4 } },
    });
    const guess = predictNextPosition(state, state.characters[1]!, { x: 0, y: 0 }, createRoundRandom(1, 0, 'A1'));
    expect(guess).toEqual({ x: 5, y: 3 });
  });

  it('猜法：預告階段，猜他往預告位置走一步', () => {
    // B1 在 (6, 2)，預告位置 (4, 2)：唯一的最短路第一步是 (5, 2)
    const state = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 6, y: 2 } },
      flag: { status: 'announced', roundsLeft: 2, nextPosition: { x: 4, y: 2 } },
    });
    const guess = predictNextPosition(state, state.characters[1]!, { x: 0, y: 0 }, createRoundRandom(1, 0, 'A1'));
    expect(guess).toEqual({ x: 5, y: 2 });
  });

  it('猜法：隱藏階段，猜他往他的待命點走一步', () => {
    // B1 在重生點 (8, 4)，B 隊待命點 (5, 4)：第一步是 (7, 4)
    const state = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 8, y: 4 } },
      flag: { status: 'hidden', roundsLeft: 2 },
    });
    const guess = predictNextPosition(state, state.characters[1]!, { x: 0, y: 0 }, createRoundRandom(1, 0, 'A1'));
    expect(guess).toEqual({ x: 7, y: 4 });
  });

  it('猜法：其他情況（例如自己拿著旗）猜他不動', () => {
    const state = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 6, y: 2 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const guess = predictNextPosition(state, state.characters[1]!, { x: 0, y: 0 }, createRoundRandom(1, 0, 'A1'));
    expect(guess).toEqual({ x: 6, y: 2 });
  });

  it('猜法：猜的那一格是自己站的位置，改猜他不動', () => {
    // 旗子在 (1, 0)，B1 在 (3, 0) 往旗子走的第一步是 (2, 0)，但那是 A1 站的地方 → 猜他不動，打他現在的位置
    const state = makeState({
      A1: { position: { x: 2, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'onGround', position: { x: 1, y: 0 } },
    });
    const guess = predictNextPosition(state, state.characters[1]!, { x: 2, y: 0 }, createRoundRandom(1, 0, 'A1'));
    expect(guess).toEqual({ x: 3, y: 0 });
    for (const action of decideWithEverySeed((aiSeed) => createAttacker(aiSeed, NO_CHANCE), state)) {
      expect(action).toEqual({ type: 'shoot', direction: 'right' });
    }
  });

  it('瞄的格子超出射程或中間有牆、對手無敵中：不射擊', () => {
    const outOfRange = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 5, y: 0 } },
      flag: { status: 'onGround', position: { x: 4, y: 0 } },
    });
    const wall = makeState({
      A1: { position: { x: 4, y: 0 } },
      B1: { position: { x: 4, y: 2 } },
      flag: { status: 'onGround', position: { x: 4, y: 3 } },
    });
    const invulnerable = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 2, y: 0 }, invulnerableRoundsLeft: 2 },
      flag: FLAG_FAR_AWAY,
    });
    const config = withChances({ attackerSkipShootingChance: 0 });
    for (const state of [outOfRange, wall, invulnerable]) {
      for (const action of decideWithEverySeed((aiSeed) => createAttacker(aiSeed, config), state)) {
        expect(action.type).not.toBe('shoot');
      }
    }
  });

  it('旗子在對手手上（沒有射擊機會）：走最短路追他', () => {
    const state = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 0, y: 6 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    for (const action of decideWithEverySeed((aiSeed) => createAttacker(aiSeed, NO_CHANCE), state)) {
      expect(action).toEqual({ type: 'move', direction: 'down' });
    }
  });
});

describe('第 8 節：搶旗 AI（v0.5）', () => {
  it('「不動」的機率設成 100% 時不動', () => {
    const state = makeState({ A1: { position: { x: 2, y: 4 } }, flag: { status: 'onGround', position: { x: 4, y: 4 } } });
    const config = withChances({ flagRunnerStayChance: 1 });
    for (const action of decideWithEverySeed((aiSeed) => createFlagRunner(aiSeed, config), state)) {
      expect(action).toEqual({ type: 'stay' });
    }
  });

  it('「不動」的機率設成 100%，拿著旗時還是走最短路回家', () => {
    const state = makeState({ A1: { position: { x: 2, y: 4 } }, flag: { status: 'carried', carrierId: 'A1' } });
    const config = withChances({ flagRunnerStayChance: 1 });
    for (const action of decideWithEverySeed((aiSeed) => createFlagRunner(aiSeed, config), state)) {
      expect(action).toEqual({ type: 'move', direction: 'left' });
    }
  });

  it('v0.6 對手拿旗時往自己的待命點走，到了不動（不動的機率設成 0）', () => {
    // 9×9 固定地圖：A 隊待命點 (3, 4)
    const away = makeState({
      A1: { position: { x: 1, y: 4 } },
      B1: { position: { x: 7, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    const arrived = makeState({
      A1: { position: { x: 3, y: 4 } },
      B1: { position: { x: 7, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    for (const action of decideWithEverySeed((aiSeed) => createFlagRunner(aiSeed, NO_CHANCE), away)) {
      expect(action).toEqual({ type: 'move', direction: 'right' });
    }
    for (const action of decideWithEverySeed((aiSeed) => createFlagRunner(aiSeed, NO_CHANCE), arrived)) {
      expect(action).toEqual({ type: 'stay' });
    }
    // 11×11 隨機地圖（種子 1）：待命點 (4, 4)；A1 在 (2, 4) 往右走
    const randomMap = makeState({
      map: createInitialState(CTF_CONFIG, 1).map,
      A1: { position: { x: 2, y: 4 } },
      B1: { position: { x: 9, y: 9 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    for (const action of decideWithEverySeed((aiSeed) => createFlagRunner(aiSeed, NO_CHANCE), randomMap)) {
      expect(action).toEqual({ type: 'move', direction: 'right' });
    }
  });

  it('不射擊', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 2, y: 0 } }, flag: FLAG_FAR_AWAY });
    for (const action of decideWithEverySeed((aiSeed) => createFlagRunner(aiSeed), state)) {
      expect(action.type).not.toBe('shoot');
    }
  });
});

describe('第 8 節：隨機亂走 AI（v0.5）', () => {
  it('每回合從上下左右走一格、不動裡隨機選一個；不同回合會選到不同的', () => {
    const bot = createRandomWalker(42);
    const seen = new Set<string>();
    for (let round = 0; round < 60; round++) {
      const action = decide(bot, makeState({ round, flag: FLAG_FAR_AWAY }));
      seen.add(action.type === 'move' ? action.direction : action.type);
    }
    expect(seen).toEqual(new Set(['up', 'down', 'left', 'right', 'stay']));
  });
});

describe('第 8、9 節：AI 對打（v0.5）', () => {
  it('攻擊型對攻擊型，種子 1 到 30 各打一場（v0.6：用各自的隨機地圖），沒有任何一場是 0:0 平手', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const final = playMatch('attacker', 'attacker', seed);
      const zeroZeroDraw = final.result?.reason === 'draw' && final.scores.A === 0 && final.scores.B === 0;
      expect(zeroZeroDraw, `種子 ${seed}`).toBe(false);
    }
  });

  it('搶旗對搶旗，種子 1 到 30 各打一場（v0.6：用各自的隨機地圖），沒有任何一場是 0:0 平手', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const final = playMatch('runner', 'runner', seed);
      const zeroZeroDraw = final.result?.reason === 'draw' && final.scores.A === 0 && final.scores.B === 0;
      expect(zeroZeroDraw, `種子 ${seed}`).toBe(false);
    }
  });

  it('三種 AI 互相對打都能在回合上限內結束', () => {
    for (const [kindA, kindB] of [['random', 'runner'], ['attacker', 'runner'], ['random', 'attacker']] as const) {
      const final = playMatch(kindA, kindB, 7);
      expect(final.result).not.toBeNull();
      expect(final.round).toBeLessThanOrEqual(250);
    }
  });

  it('同一個比賽種子建立的 AI，同樣的場面回傳同樣的動作；每一場都可以重新建立', () => {
    const state = makeState({ A1: { position: { x: 4, y: 0 } }, flag: { status: 'onGround', position: { x: 4, y: 2 } } });
    expect(decide(createBot('runner', 5, 'A1'), state)).toEqual(decide(createBot('runner', 5, 'A1'), state));
  });

  it('對打指令用同樣的 AI 和種子跑兩次，輸出完全一樣；開頭印出種子', () => {
    const run = (): string =>
      execFileSync(process.execPath, ['games/ctf/scripts/match.ts', 'attacker', 'runner', '7'], { encoding: 'utf8' });
    const first = run();
    const second = run();
    expect(second).toBe(first);
    expect(first.split('\n')[0]).toBe('種子：7');
    expect(first).toContain('旗子還沒出現，2 回合後公布位置');
    expect(first).toMatch(/旗子 2 回合後出現在 \(5, \d+\)/);
  });
});

describe('第 8 節：範例 AI 用的是場面裡的地圖（v0.6）', () => {
  // 一張和預設不同的 9×9 固定地圖：(1, 4)、(2, 4) 擋在 A 家門口，(4, 1) 不是牆
  const TEST_MAP: GameMap = {
    width: 9,
    height: 9,
    spawnPoints: { A: { x: 0, y: 4 }, B: { x: 8, y: 4 } },
    walls: [
      { x: 1, y: 4 },
      { x: 2, y: 4 },
    ],
  };

  it('找路時會繞過那張地圖的牆', () => {
    // A1 拿旗在 (3, 4) 要回家 (0, 4)：直走會撞到 (2, 4)，最短路要往上或往下繞
    const state = makeState({
      map: TEST_MAP,
      A1: { position: { x: 3, y: 4 } },
      B1: { position: { x: 8, y: 8 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const directions = new Set(decideWithEverySeed((aiSeed) => createFlagRunner(aiSeed, NO_CHANCE), state).map(moveDirection));
    expect(directions).toEqual(new Set(['up', 'down']));
  });

  it('預設地圖的牆在這張地圖上不存在：(4, 0) 往 (4, 2) 可以直接往下走', () => {
    // 9×9 固定地圖上 (4, 1) 是牆要繞路；這張地圖沒有，所以直接往下
    const state = makeState({
      map: TEST_MAP,
      A1: { position: { x: 4, y: 0 } },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'onGround', position: { x: 4, y: 2 } },
    });
    for (const action of decideWithEverySeed((aiSeed) => createFlagRunner(aiSeed, NO_CHANCE), state)) {
      expect(action).toEqual({ type: 'move', direction: 'down' });
    }
  });

  it('判斷射擊線時用那張地圖的牆', () => {
    // 9×9 固定地圖上 (4, 0) 往下被 (4, 1) 擋住；這張地圖可以打到 (4, 2)
    expect(shootingDirection({ x: 4, y: 0 }, { x: 4, y: 2 }, CLASSIC_MAP_9X9, 3)).toBeNull();
    expect(shootingDirection({ x: 4, y: 0 }, { x: 4, y: 2 }, TEST_MAP, 3)).toBe('down');
    // 這張地圖 (2, 4) 是牆：從 (3, 4) 往左打不到 (1, 4) 後面的 (0, 4)
    expect(shootingDirection({ x: 3, y: 4 }, { x: 0, y: 4 }, TEST_MAP, 3)).toBeNull();

    const state = makeState({
      map: TEST_MAP,
      A1: { position: { x: 4, y: 0 } },
      B1: { position: { x: 4, y: 2 } },
      flag: { status: 'onGround', position: { x: 8, y: 8 } },
    });
    const config = withChances({ attackerAimAtCurrentChance: 1, attackerSkipShootingChance: 0 });
    for (const action of decideWithEverySeed((aiSeed) => createAttacker(aiSeed, config), state)) {
      expect(action).toEqual({ type: 'shoot', direction: 'down' });
    }
  });
});
