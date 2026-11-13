// v0.6：地圖放在場面資料裡、隨機地圖（規則第 2 節、第 9 節「地圖」）

import { describe, expect, it } from 'vitest';
import {
  allOpenCellsConnected,
  CTF_CONFIG,
  createInitialState,
  flagCandidateCells,
  fnv1a,
  generateMap,
  getCharacterView,
  resolveRound,
  type CtfConfig,
  type GameMap,
  type GameState,
  type Position,
} from '../core/index.ts';
import { describeMap } from '../scripts/mapReport.ts';
import { characterOf, makeState, move, positionOf, shoot } from './helpers.ts';

/** 把「(3, 0)、(7, 0)…」這種文字變成座標陣列（直接抄規則文件的核對例子） */
function parseCells(text: string): Position[] {
  return [...text.matchAll(/\((\d+), (\d+)\)/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));
}

const generate = (seed: number, config: CtfConfig = CTF_CONFIG) =>
  generateMap(seed, config.boardWidth, config.boardHeight, config.map);

const key = (cell: Position): string => `${cell.x},${cell.y}`;

/** 檢查一張地圖符合第 9 節列的條件；mirror 是要不要檢查左右鏡像 */
function checkMap(map: GameMap, mirror: boolean, label: string): void {
  const walls = new Set(map.walls.map(key));
  expect(map.walls.length, `${label} 牆壁格數`).toBeGreaterThanOrEqual(14);
  expect(map.walls.length, `${label} 牆壁格數`).toBeLessThanOrEqual(18);
  if (mirror) {
    for (const wall of map.walls) {
      expect(walls.has(key({ x: map.width - 1 - wall.x, y: wall.y })), `${label} 鏡像 ${key(wall)}`).toBe(true);
    }
  }
  for (const spawn of [map.spawnPoints.A, map.spawnPoints.B]) {
    for (const wall of map.walls) {
      const inside = Math.abs(wall.x - spawn.x) <= 2 && Math.abs(wall.y - spawn.y) <= 2;
      expect(inside, `${label} 重生點 ${key(spawn)} 淨空範圍內有牆 ${key(wall)}`).toBe(false);
    }
  }
  expect(flagCandidateCells(map).length, `${label} 中線不是牆的格數`).toBeGreaterThanOrEqual(7);
  expect(map.walls.some((wall) => wall.y === 5), `${label} 中間橫排有牆`).toBe(true);
  expect(allOpenCellsConnected(map), `${label} 互相走得到`).toBe(true);
  for (let y = 0; y < map.height - 1; y++) {
    for (let x = 0; x < map.width - 1; x++) {
      const square = [key({ x, y }), key({ x: x + 1, y }), key({ x, y: y + 1 }), key({ x: x + 1, y: y + 1 })];
      expect(square.every((cell) => walls.has(cell)), `${label} 2×2 全是牆 (${x}, ${y})`).toBe(false);
    }
  }
  // 牆壁照「y 由小到大，y 相同時 x 由小到大」排列
  const sorted = [...map.walls].sort((a, b) => a.y - b.y || a.x - b.x);
  expect(map.walls, `${label} 排列順序`).toEqual(sorted);
}

/** 從開局開始一直讓 A1 得分（站在家右邊一格往左走），記下前 count 面旗子出現的位置 */
function flagSequence(start: GameState, count: number): Position[] {
  let state = start;
  const positions: Position[] = [];
  while (positions.length < count) {
    if (state.flag.status === 'onGround') {
      positions.push(state.flag.position);
      state = structuredClone(state);
      const home = state.map.spawnPoints.A;
      characterOf(state, 'A1').position = { x: home.x + 1, y: home.y };
      state.flag = { status: 'carried', carrierId: 'A1' };
      state = resolveRound(state, { A1: move('left') }).state;
      state.scores = { A: 0, B: 0 };
      continue;
    }
    state = resolveRound(state, {}).state;
  }
  return positions;
}

describe('第 2 節：地圖放在場面資料裡（v0.6）', () => {
  it('預設設定開場：場面資料裡有地圖，11×11，重生點 (0, 5)、(10, 5)，角色站在重生點', () => {
    const state = createInitialState();
    expect(state.map.width).toBe(11);
    expect(state.map.height).toBe(11);
    expect(state.map.spawnPoints).toEqual({ A: { x: 0, y: 5 }, B: { x: 10, y: 5 } });
    expect(positionOf(state, 'A1')).toEqual({ x: 0, y: 5 });
    expect(positionOf(state, 'B1')).toEqual({ x: 10, y: 5 });
  });

  it('給 AI 腳本看的場面裡有地圖，沒有種子和亂數狀態', () => {
    const state = createInitialState(CTF_CONFIG, 1);
    const view = getCharacterView(state, 'A1');
    expect(view.state.map).toEqual(state.map);
    expect(view.state).not.toHaveProperty('seed');
    expect(view.state).not.toHaveProperty('rngState');
  });

  it('地圖整場比賽不變，結算後的場面還是同一張', () => {
    const state = createInitialState(CTF_CONFIG, 7);
    const { state: next } = resolveRound(state, { A1: move('right') });
    expect(next.map).toEqual(state.map);
  });

  it('結算照場面裡的地圖，不照設定檔：用種子 1 開場後，(4, 5) 走不進去、子彈會被 (4, 5) 擋住', () => {
    const start = createInitialState(CTF_CONFIG, 1);
    // A1 站在 (3, 5) 往右走：(4, 5) 是牆
    const blocked = structuredClone(start);
    characterOf(blocked, 'A1').position = { x: 3, y: 5 };
    const moved = resolveRound(blocked, { A1: move('right') });
    expect(positionOf(moved.state, 'A1')).toEqual({ x: 3, y: 5 });
    expect(moved.events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', characterId: 'A1', reason: 'wall' }));

    // A1 在 (3, 5) 往右射，B1 在 (5, 5)：中間的 (4, 5) 是牆，打不到
    const shot = structuredClone(start);
    characterOf(shot, 'A1').position = { x: 3, y: 5 };
    characterOf(shot, 'B1').position = { x: 5, y: 5 };
    const fired = resolveRound(shot, { A1: shoot('right') });
    expect(characterOf(fired.state, 'B1').hp).toBe(3);
    expect(fired.events).toContainEqual(expect.objectContaining({ type: 'shot', hitId: null, endPosition: { x: 3, y: 5 } }));
  });
});

describe('第 2 節：指定固定地圖開場（v0.6）', () => {
  // 7×5 的小地圖：重生點 (0, 2)、(6, 2)，中線 x = 3，(3, 0)、(3, 1) 是牆
  const SMALL_MAP: GameMap = {
    width: 7,
    height: 5,
    spawnPoints: { A: { x: 0, y: 2 }, B: { x: 6, y: 2 } },
    walls: [
      { x: 3, y: 1 },
      { x: 3, y: 0 },
    ],
  };

  it('場面裡的地圖就是指定的那一張（牆壁照順序排好）', () => {
    const state = createInitialState(CTF_CONFIG, 1, SMALL_MAP);
    expect(state.map).toEqual({ ...SMALL_MAP, walls: [{ x: 3, y: 0 }, { x: 3, y: 1 }] });
    expect(positionOf(state, 'A1')).toEqual({ x: 0, y: 2 });
    expect(positionOf(state, 'B1')).toEqual({ x: 6, y: 2 });
    // 指定固定地圖時，種子仍然照常存著（決定旗子位置和 AI 的隨機）
    expect(state).toMatchObject({ seed: 1, rngState: 1 });
  });

  it('撞牆、出界照那一張地圖', () => {
    const state = makeState({ map: SMALL_MAP, A1: { position: { x: 2, y: 1 } }, B1: { position: { x: 6, y: 4 } } });
    const { state: next, events } = resolveRound(state, { A1: move('right'), B1: move('down') });
    expect(positionOf(next, 'A1')).toEqual({ x: 2, y: 1 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', characterId: 'A1', reason: 'wall' }));
    // 高度只有 5：(6, 4) 往下是場外
    expect(events).toContainEqual(expect.objectContaining({ type: 'moveBlocked', characterId: 'B1', reason: 'outOfBounds' }));
  });

  it('射擊被那一張地圖的牆擋住', () => {
    const state = makeState({ map: SMALL_MAP, A1: { position: { x: 2, y: 0 } }, B1: { position: { x: 4, y: 0 } } });
    const { state: next } = resolveRound(state, { A1: shoot('right') });
    expect(characterOf(next, 'B1').hp).toBe(3);
  });

  it('重生位置、得分位置照那一張地圖的重生點', () => {
    const respawn = makeState({ map: SMALL_MAP, A1: { position: null, respawnCountdown: 1 } });
    expect(positionOf(resolveRound(respawn, {}).state, 'A1')).toEqual({ x: 0, y: 2 });

    const scoring = makeState({
      map: SMALL_MAP,
      A1: { position: { x: 1, y: 2 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    expect(resolveRound(scoring, { A1: move('left') }).state.scores.A).toBe(1);
  });

  it('旗子候選格照那一張地圖：中線 x = 3 上不是牆的 (3, 2)、(3, 3)、(3, 4)', () => {
    expect(flagCandidateCells(SMALL_MAP)).toEqual([
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 3, y: 4 },
    ]);
    for (let seed = 1; seed <= 20; seed++) {
      const positions = flagSequence(createInitialState(CTF_CONFIG, seed, SMALL_MAP), 5);
      for (const position of positions) {
        expect(flagCandidateCells(SMALL_MAP)).toContainEqual(position);
      }
    }
  });
});

describe('第 2 節：隨機地圖（v0.6）', () => {
  it('地圖亂數的初始狀態：FNV-1a("map:1") = 4027749792、FNV-1a("map:42") = 424517687', () => {
    expect(fnv1a('map:1')).toBe(4027749792);
    expect(fnv1a('map:42')).toBe(424517687);
  });

  it('種子 1、2、42 生成的牆壁和「核對用的例子」完全一樣（包含排列順序）', () => {
    const cases = [
      {
        seed: 1,
        draws: 1,
        walls: '(3, 0)、(7, 0)、(1, 1)、(5, 1)、(9, 1)、(4, 3)、(6, 3)、(4, 5)、(6, 5)、(4, 7)、(6, 7)、(0, 8)、(10, 8)、(5, 9)、(0, 10)、(5, 10)、(10, 10)',
      },
      {
        seed: 2,
        draws: 2,
        walls: '(0, 0)、(10, 0)、(2, 1)、(3, 1)、(4, 1)、(6, 1)、(7, 1)、(8, 1)、(3, 4)、(7, 4)、(3, 5)、(7, 5)、(3, 6)、(7, 6)、(2, 9)、(8, 9)',
      },
      {
        seed: 42,
        draws: 3,
        walls: '(1, 0)、(3, 0)、(4, 0)、(5, 0)、(6, 0)、(7, 0)、(9, 0)、(1, 2)、(2, 2)、(8, 2)、(9, 2)、(4, 5)、(6, 5)、(4, 6)、(6, 6)、(3, 9)、(7, 9)',
      },
    ];
    for (const { seed, draws, walls } of cases) {
      const generated = generate(seed);
      expect(generated.map.walls, `種子 ${seed}`).toEqual(parseCells(walls));
      expect(generated.drawsUsed, `種子 ${seed} 第幾張合格`).toBe(draws);
      // 開場場面裡的地圖也是這一張
      expect(createInitialState(CTF_CONFIG, seed).map.walls).toEqual(parseCells(walls));
    }
  });

  it('種子 1、鏡像關生成的牆壁和「核對用的例子」完全一樣', () => {
    const config: CtfConfig = { ...CTF_CONFIG, map: { ...CTF_CONFIG.map, mirror: false } };
    const generated = generate(1, config);
    expect(generated.map.walls).toEqual(
      parseCells(
        '(5, 0)、(8, 0)、(9, 0)、(10, 0)、(3, 1)、(8, 2)、(3, 4)、(3, 5)、(5, 6)、(6, 6)、(7, 6)、(0, 8)、(7, 8)、(7, 9)、(10, 9)、(1, 10)、(7, 10)、(10, 10)',
      ),
    );
    expect(generated.drawsUsed).toBe(1);
  });

  it('生成地圖不動場面資料裡的亂數狀態（初始值仍然是種子）', () => {
    expect(createInitialState(CTF_CONFIG, 42)).toMatchObject({ seed: 42, rngState: 42 });
  });

  it('種子 1 的前三面旗子是 (5, 6)、(5, 0)、(5, 5)；種子 42 是 (5, 7)、(5, 5)、(5, 9)', () => {
    const seed1 = createInitialState(CTF_CONFIG, 1);
    expect(flagCandidateCells(seed1.map).map((cell) => cell.y)).toEqual([0, 2, 3, 4, 5, 6, 7, 8]);
    expect(flagSequence(seed1, 3)).toEqual([
      { x: 5, y: 6 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ]);
    expect(flagSequence(createInitialState(CTF_CONFIG, 42), 3)).toEqual([
      { x: 5, y: 7 },
      { x: 5, y: 5 },
      { x: 5, y: 9 },
    ]);
  });

  it('同一個種子生成兩次，地圖完全一樣；種子 1 到 50 至少有 40 張不同的地圖', () => {
    expect(generate(17)).toEqual(generate(17));
    const distinct = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) distinct.add(JSON.stringify(generate(seed).map.walls));
    expect(distinct.size).toBeGreaterThanOrEqual(40);
  });

  it('種子 0 到 999 的每一張地圖都符合條件（格數、鏡像、淨空、中線、中間橫排、走得到、沒有 2×2 全是牆）', () => {
    for (let seed = 0; seed <= 999; seed++) {
      checkMap(generate(seed).map, true, `種子 ${seed}`);
    }
  });

  it('鏡像關：種子 0 到 199 都符合鏡像以外的條件，而且至少有一張不是左右鏡像', () => {
    const config: CtfConfig = { ...CTF_CONFIG, map: { ...CTF_CONFIG.map, mirror: false } };
    let asymmetric = 0;
    for (let seed = 0; seed <= 199; seed++) {
      const { map } = generate(seed, config);
      checkMap(map, false, `鏡像關 種子 ${seed}`);
      const walls = new Set(map.walls.map(key));
      if (map.walls.some((wall) => !walls.has(key({ x: map.width - 1 - wall.x, y: wall.y })))) asymmetric++;
    }
    expect(asymmetric).toBeGreaterThan(0);
  });

  it('把設定改到不可能合格（最少 60 格牆）時，建立開場場面會報錯，不會卡住不動', () => {
    const config: CtfConfig = { ...CTF_CONFIG, map: { ...CTF_CONFIG.map, minWalls: 60 } };
    expect(() => createInitialState(config, 1)).toThrow(/重抽 1000 張地圖都不合格/);
  });
});

describe('第 8 節：npm run ctf:map（v0.6）', () => {
  it('印出種子 1 的地圖（和第 2 節的圖一樣，含 f 記號）、牆壁格數、旗子候選格數', () => {
    const lines = describeMap(1);
    const text = lines.join('\n');
    // 規則文件第 2 節「種子 1 的地圖」
    const expectedMap = [
      '     0  1  2  3  4  5  6  7  8  9 10',
      ' 0   .  .  .  #  .  f  .  #  .  .  .',
      ' 1   .  #  .  .  .  #  .  .  .  #  .',
      ' 2   .  .  .  .  .  f  .  .  .  .  .',
      ' 3   .  .  .  .  #  f  #  .  .  .  .',
      ' 4   .  .  .  .  .  f  .  .  .  .  .',
      ' 5   A  .  .  .  #  f  #  .  .  .  B',
      ' 6   .  .  .  .  .  f  .  .  .  .  .',
      ' 7   .  .  .  .  #  f  #  .  .  .  .',
      ' 8   #  .  .  .  .  f  .  .  .  .  #',
      ' 9   .  .  .  .  .  #  .  .  .  .  .',
      '10   #  .  .  .  .  #  .  .  .  .  #',
    ].join('\n');
    expect(text).toContain(expectedMap);
    expect(lines).toContain('牆壁格數：17');
    expect(lines).toContain('旗子候選格數：8');
    expect(lines[0]).toContain('種子：1');
  });
});
