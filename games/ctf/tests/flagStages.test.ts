// v0.5：旗子的三個階段、種子與亂數、得分後重新開局（規則第 5 節、第 9 節）

import { describe, expect, it } from 'vitest';
import { createBot } from '../bots/index.ts';
import {
  CLASSIC_MAP_9X9,
  CTF_CONFIG,
  createInitialState,
  flagCandidateCells,
  getCharacterView,
  isWall,
  resolveRound,
  type ActionMap,
  type CtfConfig,
  type GameEvent,
  type GameMap,
  type GameState,
  type Position,
} from '../core/index.ts';
import { characterOf, hpOf, makeState, move, positionOf, shoot, stay } from './helpers.ts';

const at = (position: Position): string => `(${position.x}, ${position.y})`;

/** A1 站在自己家右邊一格拿著旗，往左走一步就得分（N = 這一回合）。9×9 固定地圖是 (1, 4) */
function aboutToScore(base: GameState): GameState {
  const state = structuredClone(base);
  const home = state.map.spawnPoints.A;
  characterOf(state, 'A1').position = { x: home.x + 1, y: home.y };
  state.flag = { status: 'carried', carrierId: 'A1' };
  return state;
}

/**
 * 從開局開始，一直讓 A1 得分，記下每一面旗子「出現」的位置。
 * 每次得分後把分數歸零，避免比賽結束（只看旗子位置，和分數無關）。
 * map 預設是 9×9 固定地圖（v0.5 的測試）；傳 null 表示用種子生成的隨機地圖（v0.6）。
 */
function flagSequence(
  seed: number,
  count: number,
  config: CtfConfig = CTF_CONFIG,
  map: GameMap | null = CLASSIC_MAP_9X9,
): Position[] {
  let state = createInitialState(config, seed, map ?? undefined);
  const positions: Position[] = [];
  while (positions.length < count) {
    if (state.flag.status === 'onGround') {
      positions.push(state.flag.position);
      state = aboutToScore(state);
      state = resolveRound(state, { A1: move('left') }, config).state;
      state.scores = { A: 0, B: 0 };
      continue;
    }
    state = resolveRound(state, {}, config).state;
  }
  return positions;
}

describe('第 5 節：旗子的三個階段（v0.5）', () => {
  it('開局：場上沒有旗子；第 2 回合結算完進入預告、場面資訊裡有位置；第 4 回合結算完旗子出現', () => {
    let state = createInitialState();
    expect(state.flag).toEqual({ status: 'hidden', roundsLeft: 2 });

    state = resolveRound(state, {}).state; // 第 1 回合
    expect(state.flag).toEqual({ status: 'hidden', roundsLeft: 1 });

    const round2 = resolveRound(state, {}); // 第 2 回合
    state = round2.state;
    expect(state.flag).toMatchObject({ status: 'announced', roundsLeft: 2 });
    const announced = state.flag.status === 'announced' ? state.flag.nextPosition : null;
    expect(announced).not.toBeNull();
    expect(round2.events).toContainEqual({ type: 'flagAnnounced', position: announced, roundsLeft: 2 });

    state = resolveRound(state, {}).state; // 第 3 回合
    expect(state.flag).toEqual({ status: 'announced', roundsLeft: 1, nextPosition: announced });

    const round4 = resolveRound(state, {}); // 第 4 回合
    expect(round4.state.flag).toEqual({ status: 'onGround', position: announced });
    expect(round4.events).toContainEqual({ type: 'flagAppeared', position: announced });
  });

  it('開局：最早第 5 回合撿到；預告期間走進預告格不會撿到任何東西', () => {
    // 種子 1 的第一面旗子在 (4, 5)（見下面「手算」的測試）。A1 從旁邊的 (3, 5) 進進出出
    let state = makeState({ A1: { position: { x: 3, y: 5 } } });
    state = resolveRound(state, { A1: move('right') }).state; // 第 1 回合：隱藏中走進 (4, 5)
    state = resolveRound(state, { A1: move('left') }).state; // 第 2 回合：結算完進入預告
    expect(state.flag).toMatchObject({ status: 'announced', nextPosition: { x: 4, y: 5 } });

    state = resolveRound(state, { A1: move('right') }).state; // 第 3 回合：預告中走進預告格
    expect(positionOf(state, 'A1')).toEqual({ x: 4, y: 5 });
    expect(state.flag.status).toBe('announced');

    state = resolveRound(state, { A1: move('left') }).state; // 第 4 回合：結算完旗子出現
    expect(state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 5 } });

    const round5 = resolveRound(state, { A1: move('right') }); // 第 5 回合：走進去撿到
    expect(round5.state.round).toBe(5);
    expect(round5.state.flag).toEqual({ status: 'carried', carrierId: 'A1' });
  });

  it('第 N 回合得分：第 N+2 回合結算完進入預告，第 N+4 回合結算完出現', () => {
    const N = 11;
    let state = aboutToScore(makeState({ round: N - 1 }));
    state = resolveRound(state, { A1: move('left') }).state;
    expect(state.round).toBe(N);
    expect(state.flag).toEqual({ status: 'hidden', roundsLeft: 2 }); // 這回合才得分的不減

    state = resolveRound(state, {}).state; // N+1
    expect(state.flag).toEqual({ status: 'hidden', roundsLeft: 1 });
    state = resolveRound(state, {}).state; // N+2
    expect(state.round).toBe(N + 2);
    expect(state.flag).toMatchObject({ status: 'announced', roundsLeft: 2 });
    state = resolveRound(state, {}).state; // N+3
    expect(state.flag).toMatchObject({ status: 'announced', roundsLeft: 1 });
    state = resolveRound(state, {}).state; // N+4
    expect(state.round).toBe(N + 4);
    expect(state.flag.status).toBe('onGround');
  });

  it('隱藏期間場面資訊裡沒有下一個位置（也還沒抽，亂數狀態沒動）', () => {
    let state = createInitialState();
    for (let round = 1; round <= 2; round++) {
      expect(state.flag.status).toBe('hidden');
      expect(state.flag).not.toHaveProperty('nextPosition');
      expect(state.flag).not.toHaveProperty('position');
      expect(state.rngState).toBe(state.seed);
      state = resolveRound(state, {}).state;
    }
    // 進入預告的那一刻才抽：剛好取一次亂數
    expect(state.flag.status).toBe('announced');
    expect(state.rngState).toBe((state.seed + 0x6d2b79f5) >>> 0);
  });

  it('旗子出現時站在那一格的人不會自動撿起，要離開再走進來', () => {
    let state = makeState({
      A1: { position: { x: 4, y: 2 } },
      flag: { status: 'announced', roundsLeft: 1, nextPosition: { x: 4, y: 2 } },
    });
    state = resolveRound(state, { A1: stay }).state;
    expect(state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 2 } });
    state = resolveRound(state, { A1: stay }).state;
    expect(state.flag.status).toBe('onGround');
    state = resolveRound(state, { A1: move('down') }).state;
    state = resolveRound(state, { A1: move('up') }).state;
    expect(state.flag).toEqual({ status: 'carried', carrierId: 'A1' });
  });

  it('預告期間角色站在預告格上沒有任何效果', () => {
    const state = makeState({
      A1: { position: { x: 4, y: 2 } },
      flag: { status: 'announced', roundsLeft: 2, nextPosition: { x: 4, y: 2 } },
    });
    const { state: next, events } = resolveRound(state, { A1: stay });
    expect(next.flag).toEqual({ status: 'announced', roundsLeft: 1, nextPosition: { x: 4, y: 2 } });
    expect(events.filter((event) => event.type.startsWith('flag'))).toEqual([]);
  });

  it('候選格：9×9 固定地圖是中線 x = 4 上不是牆的 7 格，照 y 由小到大', () => {
    expect(flagCandidateCells(CLASSIC_MAP_9X9)).toEqual([0, 2, 3, 4, 5, 6, 8].map((y) => ({ x: 4, y })));
  });

  it('位置一定在中線上、不是牆（v0.6：照那一場的地圖）；同一場裡連續兩面旗子不會出現在同一格（多個種子、多次得分）', () => {
    for (let seed = 1; seed <= 25; seed++) {
      // 9×9 固定地圖，以及這個種子生成的 11×11 隨機地圖都檢查
      for (const map of [CLASSIC_MAP_9X9, createInitialState(CTF_CONFIG, seed).map]) {
        const positions = flagSequence(seed, 15, CTF_CONFIG, map);
        positions.forEach((position, index) => {
          const label = `種子 ${seed}（${map.width}×${map.height}）第 ${index + 1} 面`;
          expect(position.x, label).toBe(Math.floor(map.width / 2));
          expect(isWall(position, map), label).toBe(false);
          if (index > 0) expect(position, label).not.toEqual(positions[index - 1]);
        });
      }
    }
  });

  it('「上一面旗子出現的那一格」記的是出現時的位置，不是後來被帶到的位置', () => {
    let state = makeState({ A1: { position: { x: 3, y: 5 } } }); // 種子 1：第一面在 (4, 5)
    for (let round = 0; round < 4; round++) state = resolveRound(state, {}).state;
    expect(state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 5 } });
    expect(state.lastFlagSpawn).toEqual({ x: 4, y: 5 });
    state = resolveRound(state, { A1: move('right') }).state; // 撿起來
    state = resolveRound(state, { A1: move('up') }).state; // 帶到 (4, 4) 再放下
    state = resolveRound(state, { A1: { type: 'dropFlag' } }).state;
    expect(state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 4 } });
    expect(state.lastFlagSpawn).toEqual({ x: 4, y: 5 });
  });

  it('指定種子時，抽到的位置和照第 5 節算法手算的結果一致（種子 1、9×9 固定地圖的前三面旗子）', () => {
    // 手算（另外用 Python 照 mulberry32 算過）：
    // 第 1 面：亂數狀態 1 + 0x6D2B79F5 = 0x6D2B79F6，r ≈ 0.627074；候選 7 格，0.627074 × 7 = 4.39 → 第 4 個 = (4, 5)
    // 第 2 面：亂數狀態 0xDA56F3EB，r ≈ 0.002736；去掉 (4, 5) 剩 6 格，× 6 = 0.016 → 第 0 個 = (4, 0)
    // 第 3 面：亂數狀態 0x47826DE0，r ≈ 0.527447；去掉 (4, 0) 剩 6 格，× 6 = 3.16 → 第 3 個 = (4, 5)
    expect(flagSequence(1, 3)).toEqual([
      { x: 4, y: 5 },
      { x: 4, y: 0 },
      { x: 4, y: 5 },
    ]);
  });

  it('隱藏回合數設成 0：開局和得分時直接抽位置，進入預告', () => {
    const config: CtfConfig = { ...CTF_CONFIG, flagHiddenRounds: 0 };
    const start = createInitialState(config, 1, CLASSIC_MAP_9X9);
    expect(start.flag).toEqual({ status: 'announced', roundsLeft: 2, nextPosition: { x: 4, y: 5 } });

    let state = makeState({ round: 20 });
    state = { ...aboutToScore(state), flag: { status: 'carried', carrierId: 'A1' } };
    const scored = resolveRound(state, { A1: move('left') }, config);
    expect(scored.state.flag).toMatchObject({ status: 'announced', roundsLeft: 2 }); // 這回合才得分的不減
    expect(scored.events).toContainEqual(expect.objectContaining({ type: 'flagAnnounced' }));
    state = resolveRound(scored.state, {}, config).state;
    expect(state.flag).toMatchObject({ status: 'announced', roundsLeft: 1 });
    state = resolveRound(state, {}, config).state;
    expect(state.flag.status).toBe('onGround');
  });

  it('預告回合數設成 0：隱藏結束時直接出現', () => {
    const config: CtfConfig = { ...CTF_CONFIG, flagAnnounceRounds: 0 };
    let state = createInitialState(config, 1, CLASSIC_MAP_9X9);
    expect(state.flag).toEqual({ status: 'hidden', roundsLeft: 2 });
    state = resolveRound(state, {}, config).state;
    expect(state.flag).toEqual({ status: 'hidden', roundsLeft: 1 });
    const round2 = resolveRound(state, {}, config);
    expect(round2.state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 5 } });
    expect(round2.events).toContainEqual({ type: 'flagAppeared', position: { x: 4, y: 5 } });
    expect(round2.events.some((event) => event.type === 'flagAnnounced')).toBe(false);
  });

  it('兩個都設成 0：開局和得分時直接抽位置，旗子立刻在場上（得分後的下一回合就能撿）', () => {
    const config: CtfConfig = { ...CTF_CONFIG, flagHiddenRounds: 0, flagAnnounceRounds: 0 };
    const start = createInitialState(config, 1, CLASSIC_MAP_9X9);
    expect(start.flag).toEqual({ status: 'onGround', position: { x: 4, y: 5 } });

    // B1 站在旗子會出現的格子旁邊。A1 得分的那一回合旗子就出現；下一回合 B1 走進去就撿到
    let state = aboutToScore(start);
    characterOf(state, 'B1').position = { x: 5, y: 0 };
    const scored = resolveRound(state, { A1: move('left') }, config);
    // 種子 1 的第二面旗子在 (4, 0)
    expect(scored.state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 0 } });
    state = resolveRound(scored.state, { B1: move('left') }, config).state;
    expect(state.flag).toEqual({ status: 'carried', carrierId: 'B1' });
  });

  it('延長賽中階段照常倒數，不重置', () => {
    let state = makeState({ phase: 'overtime', round: 210, flag: { status: 'hidden', roundsLeft: 2 } });
    state = resolveRound(state, {}).state;
    expect(state.flag).toEqual({ status: 'hidden', roundsLeft: 1 });
    state = resolveRound(state, {}).state;
    expect(state.flag).toMatchObject({ status: 'announced', roundsLeft: 2 });
    state = resolveRound(state, {}).state;
    state = resolveRound(state, {}).state;
    expect(state.flag.status).toBe('onGround');
    expect(state.phase).toBe('overtime');
  });
});

describe('第 5 節：種子與亂數（v0.5）', () => {
  it('開場場面存著種子，亂數狀態的初始值就是種子；沒指定種子用 1', () => {
    expect(createInitialState(CTF_CONFIG, 12345)).toMatchObject({ seed: 12345, rngState: 12345 });
    expect(createInitialState()).toMatchObject({ seed: 1, rngState: 1 });
    expect(createInitialState(CTF_CONFIG, 4294967295).seed).toBe(4294967295);
  });

  it('種子不是 0 到 4294967295 的整數時，建立開場場面會報錯', () => {
    for (const bad of [-1, 4294967296, 1.5, Number.NaN]) {
      expect(() => createInitialState(CTF_CONFIG, bad)).toThrow(RangeError);
    }
  });

  it('同一個種子、同樣的動作序列：每回合的場面和事件完全一樣', () => {
    const play = (): { state: GameState; events: GameEvent[] }[] => {
      // 動作由搶旗 AI 產生（AI 也用同一個種子），打完一整場
      const bots = { A1: createBot('runner', 99, 'A1'), B1: createBot('attacker', 99, 'B1') };
      let state = createInitialState(CTF_CONFIG, 99);
      const history: { state: GameState; events: GameEvent[] }[] = [];
      while (!state.result) {
        const actions: ActionMap = {};
        for (const character of state.characters) {
          if (!character.position) continue;
          const bot = bots[character.id as 'A1' | 'B1'];
          actions[character.id] = bot(getCharacterView(state, character.id));
        }
        const output = resolveRound(state, actions);
        history.push(output);
        state = output.state;
      }
      return history;
    };
    const first = play();
    expect(first.length).toBeGreaterThan(10);
    expect(play()).toEqual(first);
  });

  it('不同的種子：旗子位置的順序會不同（種子 1 到 5 比較）', () => {
    const sequences = [1, 2, 3, 4, 5].map((seed) => flagSequence(seed, 5).map(at).join(' '));
    expect(new Set(sequences).size).toBe(5);
  });

  it('給 AI 腳本看的場面裡沒有種子和亂數狀態', () => {
    const state = createInitialState(CTF_CONFIG, 777);
    const view = getCharacterView(state, 'A1');
    expect(view.state).not.toHaveProperty('seed');
    expect(view.state).not.toHaveProperty('rngState');
    expect(JSON.stringify(view)).not.toContain('777');
  });

  it('結算不會改到傳進來的場面（包含亂數狀態）', () => {
    const state = makeState({ flag: { status: 'hidden', roundsLeft: 1 } });
    const snapshot = structuredClone(state);
    const { state: next } = resolveRound(state, {});
    expect(state).toEqual(snapshot);
    expect(next.rngState).not.toBe(state.rngState); // 這回合抽了位置，新場面的亂數狀態變了
  });
});

describe('第 5 節：得分後重新開局（v0.5）', () => {
  const RESET_ON: CtfConfig = { ...CTF_CONFIG, resetOnScore: true };

  it('開關關掉（預設）：得分後角色的位置、生命值、離場倒數、無敵都不變', () => {
    expect(CTF_CONFIG.resetOnScore).toBe(false);
    const state = makeState({
      A1: { position: { x: 1, y: 4 }, hp: 2 },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next, events } = resolveRound(state, { A1: move('left') });
    expect(next.scores.A).toBe(1);
    expect(positionOf(next, 'A1')).toEqual({ x: 0, y: 4 });
    expect(hpOf(next, 'A1')).toBe(2);
    // B1 照平常倒數，沒有被拉回場上
    expect(characterOf(next, 'B1')).toMatchObject({ position: null, respawnCountdown: 1 });
    expect(events.some((event) => event.type === 'resetAfterScore')).toBe(false);

    const invulnerable = makeState({
      A1: { position: { x: 1, y: 4 } },
      B1: { position: { x: 6, y: 6 }, invulnerableRoundsLeft: 2 },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const after = resolveRound(invulnerable, { A1: move('left') }).state;
    expect(characterOf(after, 'B1')).toMatchObject({ position: { x: 6, y: 6 }, invulnerableRoundsLeft: 1 });
  });

  it('開關打開：得分那一回合結算完，雙方都在自己的重生點、生命值全滿、沒有無敵', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 4 }, hp: 1 },
      B1: { position: { x: 6, y: 6 }, hp: 2, invulnerableRoundsLeft: 2 },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next, events } = resolveRound(state, { A1: move('left') }, RESET_ON);
    expect(characterOf(next, 'A1')).toMatchObject({ position: { x: 0, y: 4 }, hp: 3, invulnerableRoundsLeft: 0, respawnCountdown: 0 });
    expect(characterOf(next, 'B1')).toMatchObject({ position: { x: 8, y: 4 }, hp: 3, invulnerableRoundsLeft: 0, respawnCountdown: 0 });
    expect(events).toContainEqual({ type: 'resetAfterScore' });
    // 旗子照常進入隱藏
    expect(next.flag).toEqual({ status: 'hidden', roundsLeft: 2 });
  });

  it('開關打開：得分時對手正在倒地離場中，結算完對手已經在場', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 4 } },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next, events } = resolveRound(state, { A1: move('left') }, RESET_ON);
    expect(characterOf(next, 'B1')).toMatchObject({ position: { x: 8, y: 4 }, hp: 3, respawnCountdown: 0, invulnerableRoundsLeft: 0 });
    // 這種回場不算「重生」，也不給無敵
    expect(events.some((event) => event.type === 'respawned')).toBe(false);
  });

  it('開關打開：得分那一回合得分的人被打中，擊倒數和生命值先照算，結算完生命值是滿的', () => {
    // A1 剩 1 點生命，帶旗走進家 (0, 4)；B1 在 (0, 1) 往下開槍，3 格剛好打到
    const state = makeState({
      A1: { position: { x: 1, y: 4 }, hp: 1 },
      B1: { position: { x: 0, y: 1 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next, events } = resolveRound(state, { A1: move('left'), B1: shoot('down') }, RESET_ON);
    expect(next.scores.A).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'damaged', characterId: 'A1', hpLeft: 0 }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'knockedDown', characterId: 'A1' }));
    expect(next.knockdowns).toEqual({ A: 0, B: 1 });
    expect(characterOf(next, 'A1')).toMatchObject({ position: { x: 0, y: 4 }, hp: 3, respawnCountdown: 0 });
    expect(characterOf(next, 'B1').position).toEqual({ x: 8, y: 4 });
    // 事件順序：射擊結算 → 重新開局
    const knockIndex = events.findIndex((event) => event.type === 'knockedDown');
    const resetIndex = events.findIndex((event) => event.type === 'resetAfterScore');
    expect(knockIndex).toBeLessThan(resetIndex);
  });

  it('開關打開：拿到第 3 分的那一回合，比賽照常結束', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
      scores: { A: 2, B: 1 },
    });
    const { state: next, events } = resolveRound(state, { A1: move('left') }, RESET_ON);
    expect(next.result).toEqual({ winner: 'A', reason: 'reachedWinningScore' });
    expect(events).toContainEqual({ type: 'resetAfterScore' });
    expect(events.at(-1)).toEqual({ type: 'gameOver', result: { winner: 'A', reason: 'reachedWinningScore' } });
  });
});
