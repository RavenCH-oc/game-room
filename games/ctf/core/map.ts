// 地圖（規則第 2 節，v0.6）：固定地圖，以及用種子生成左右鏡像的隨機地圖。
// 生成地圖用自己的一串亂數（初始狀態 = FNV-1a("map:<種子>")），不動場面資料裡的亂數狀態。
// 取亂數的順序和次數完全照規則文件，這樣同一個種子在任何地方生成的都是同一張地圖。

import { midlineX, middleRowY, samePosition } from './board.ts';
import type { MapGenerationConfig } from './config.ts';
import { fnv1a, nextRandom } from './random.ts';
import type { GameMap, Position } from './types.ts';

/**
 * 原本的 9×9 固定地圖（v0.5 以前的場地）。留給測試用；網頁版不提供選擇。
 */
export const CLASSIC_MAP_9X9: GameMap = {
  width: 9,
  height: 9,
  spawnPoints: { A: { x: 0, y: 4 }, B: { x: 8, y: 4 } },
  walls: sortWalls([
    { x: 2, y: 3 },
    { x: 2, y: 5 },
    { x: 6, y: 3 },
    { x: 6, y: 5 },
    { x: 4, y: 1 },
    { x: 4, y: 7 },
  ]),
};

/** 牆壁清單照「y 由小到大，y 相同時 x 由小到大」排列（回傳新的陣列） */
export function sortWalls(walls: Position[]): Position[] {
  return [...walls].map((wall) => ({ ...wall })).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 重生點：中間橫排 y = 高度除以 2 的整數部分；A 隊 x = 0，B 隊 x = 寬度 − 1 */
export function defaultSpawnPoints(width: number, height: number): GameMap['spawnPoints'] {
  const y = middleRowY({ height });
  return { A: { x: 0, y }, B: { x: width - 1, y } };
}

export interface GeneratedMap {
  map: GameMap;
  /** 第幾張才合格（1 表示抽 1 張就合格） */
  drawsUsed: number;
}

/**
 * 用種子生成一張隨機地圖（規則第 2 節「抽一張地圖的步驟」）。
 * 重抽 maxMapDraws 張都不合格就報錯。
 */
export function generateMap(seed: number, width: number, height: number, settings: MapGenerationConfig): GeneratedMap {
  let rngState = fnv1a(`map:${seed}`);
  const random = (): number => {
    const result = nextRandom(rngState);
    rngState = result.rngState;
    return result.value;
  };

  const spawnPoints = defaultSpawnPoints(width, height);
  const mid = midlineX({ width });
  const key = (x: number, y: number): string => `${x},${y}`;

  for (let draw = 1; draw <= settings.maxMapDraws; draw++) {
    // 步驟 1：清空牆壁，決定目標格數
    const walls = new Set<string>();
    const target = settings.minWalls + Math.floor(random() * (settings.maxWalls - settings.minWalls + 1));

    // 步驟 2：重複試放一段牆
    for (let attempt = 0; attempt < settings.maxPlacementAttempts && walls.size < target; attempt++) {
      // 每次試放固定取 4 次亂數，不管後來有沒有放成功
      const columns = settings.mirror ? mid + 1 : width;
      const x = Math.floor(random() * columns);
      const y = Math.floor(random() * height);
      const horizontal = random() < 0.5;
      const length = 1 + Math.floor(random() * settings.maxSegmentLength);

      const cells: Position[] = [];
      for (let index = 0; index < length; index++) {
        cells.push(horizontal ? { x: x + index, y } : { x, y: y + index });
      }

      // 超出範圍：鏡像開時 x 不能超過中線；鏡像關時不能超出場地
      const maxX = settings.mirror ? mid : width - 1;
      if (cells.some((cell) => cell.x < 0 || cell.x > maxX || cell.y < 0 || cell.y >= height)) continue;

      // 在任何一個重生點的淨空範圍內
      const nearSpawn = (cell: Position): boolean =>
        [spawnPoints.A, spawnPoints.B].some(
          (spawn) =>
            Math.abs(cell.x - spawn.x) <= settings.spawnClearance && Math.abs(cell.y - spawn.y) <= settings.spawnClearance,
        );
      if (cells.some(nearSpawn)) continue;

      // 已經是牆，或周圍 8 格裡已經有牆（新的一段牆不能碰到現有的牆，連斜角也不行）
      const touchesWall = (cell: Position): boolean => {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (walls.has(key(cell.x + dx, cell.y + dy))) return true;
          }
        }
        return false;
      };
      if (cells.some(touchesWall)) continue;

      // 鏡像開：每一格的鏡像格也一起變成牆（中線上的格子鏡像是自己，只算一格）
      const newCells = new Set(cells.map((cell) => key(cell.x, cell.y)));
      if (settings.mirror) {
        for (const cell of cells) newCells.add(key(width - 1 - cell.x, cell.y));
      }

      // 放下去會超過最多格數：作廢
      if (walls.size + newCells.size > settings.maxWalls) continue;

      for (const cell of newCells) walls.add(cell);
    }

    // 步驟 3：檢查，全部通過才採用
    const wallList = sortWalls(
      [...walls].map((text) => {
        const [x, y] = text.split(',').map(Number);
        return { x: x!, y: y! };
      }),
    );
    const map: GameMap = { width, height, spawnPoints, walls: wallList };
    if (isAcceptableMap(map, settings)) return { map, drawsUsed: draw };
    // 步驟 4：沒通過就重抽（亂數接著往下取）
  }

  // 步驟 5：重抽到上限都不合格
  throw new Error(`重抽 ${settings.maxMapDraws} 張地圖都不合格，請檢查地圖生成設定（第 7 節）。`);
}

/** 規則第 2 節步驟 3 的檢查 */
function isAcceptableMap(map: GameMap, settings: MapGenerationConfig): boolean {
  if (map.walls.length < settings.minWalls) return false;
  if (countOpenMidlineCells(map) < settings.minOpenMidlineCells) return false;
  const row = middleRowY(map);
  if (!map.walls.some((wall) => wall.y === row)) return false;
  return allOpenCellsConnected(map);
}

/** 中線上不是牆的格子有幾格 */
export function countOpenMidlineCells(map: GameMap): number {
  const x = midlineX(map);
  let count = 0;
  for (let y = 0; y < map.height; y++) {
    if (!map.walls.some((wall) => samePosition(wall, { x, y }))) count++;
  }
  return count;
}

/** 所有不是牆的格子互相走得到（只算上下左右相鄰；重生點當成普通格子） */
export function allOpenCellsConnected(map: GameMap): boolean {
  const wallKeys = new Set(map.walls.map((wall) => `${wall.x},${wall.y}`));
  const open: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!wallKeys.has(`${x},${y}`)) open.push({ x, y });
    }
  }
  if (open.length === 0) return true;
  const seen = new Set<string>([`${open[0]!.x},${open[0]!.y}`]);
  const queue: Position[] = [open[0]!];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ] as const) {
      const x = current.x + dx;
      const y = current.y + dy;
      const cellKey = `${x},${y}`;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height || wallKeys.has(cellKey) || seen.has(cellKey)) continue;
      seen.add(cellKey);
      queue.push({ x, y });
    }
  }
  return seen.size === open.length;
}

/** 把一張地圖整理成場面要存的樣子（複本、牆壁照順序排） */
export function normalizeMap(map: GameMap): GameMap {
  return {
    width: map.width,
    height: map.height,
    spawnPoints: { A: { ...map.spawnPoints.A }, B: { ...map.spawnPoints.B } },
    walls: sortWalls(map.walls),
  };
}
