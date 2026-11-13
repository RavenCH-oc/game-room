// 範例 AI 共用的小工具：找最短路、判斷射擊線、待命點、去找旗子（規則第 8 節「範例 AI」）。
// 只用來「決定要做什麼」；真正的結果還是由遊戲核心結算。
// 找路時不考慮其他角色擋路，只看牆壁、場外、對方重生點。
// v0.6：場地大小、重生點、牆壁一律從 AI 看到的場面裡的地圖讀。

import {
  DIRECTIONS,
  isEnemySpawn,
  isInsideBoard,
  isWall,
  middleRowY,
  midlineX,
  samePosition,
  step,
  type Action,
  type Direction,
  type GameMap,
  type Position,
  type PublicGameState,
  type Team,
} from '../core/index.ts';
import { pickOne, type RandomSource } from './botRandom.ts';

const STAY: Action = { type: 'stay' };

/** 這一隊的角色能不能走進這格（不看其他角色） */
export function canEnter(position: Position, team: Team, map: GameMap): boolean {
  return isInsideBoard(position, map) && !isWall(position, map) && !isEnemySpawn(position, team, map);
}

const key = (position: Position): string => `${position.x},${position.y}`;

/** 從目標往外的廣度優先搜尋：每一格離目標要走幾步（走不到的格子不在裡面） */
function distancesTo(goal: Position, team: Team, map: GameMap): Map<string, number> {
  const distances = new Map<string, number>([[key(goal), 0]]);
  const queue: Position[] = [goal];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const distance = distances.get(key(current))!;
    for (const direction of DIRECTIONS) {
      const next = step(current, direction);
      if (distances.has(key(next)) || !canEnter(next, team, map)) continue;
      distances.set(key(next), distance + 1);
      queue.push(next);
    }
  }
  return distances;
}

/** 照最短路，從 start 走到 goal 要幾步；走不到回傳 null */
export function pathDistance(start: Position, goal: Position, team: Team, map: GameMap): number | null {
  return distancesTo(goal, team, map).get(key(start)) ?? null;
}

/**
 * 「會讓距離變短的方向」：照最短路的步數，走一步後離目標更近的方向（照上、下、左、右排列）。
 * 已經在目標上或走不到時是空的。
 */
export function shorteningDirections(start: Position, goal: Position, team: Team, map: GameMap): Direction[] {
  const distances = distancesTo(goal, team, map);
  const here = distances.get(key(start));
  if (here === undefined || here === 0) return [];
  return DIRECTIONS.filter((direction) => {
    const next = step(start, direction);
    return canEnter(next, team, map) && distances.get(key(next)) === here - 1;
  });
}

/** 走最短路的一步：有好幾條一樣短的路時，從會讓距離變短的方向裡隨機選一個 */
export function stepTowards(
  start: Position,
  goal: Position,
  team: Team,
  map: GameMap,
  random: RandomSource,
): Direction | null {
  return pickOne(shorteningDirections(start, goal, team, map), random) ?? null;
}

/** 往目標走一步的動作；已經在目標上或走不到時「不動」 */
export function moveTowards(start: Position, goal: Position, team: Team, map: GameMap, random: RandomSource): Action {
  const direction = stepTowards(start, goal, team, map, random);
  return direction ? { type: 'move', direction } : STAY;
}

/** 往旁邊能走的方向隨機走一步（站在旗子或預告格上時用） */
export function stepAside(position: Position, team: Team, map: GameMap, random: RandomSource): Action {
  const choices = DIRECTIONS.filter((direction) => canEnter(step(position, direction), team, map));
  const direction = pickOne(choices, random);
  return direction ? { type: 'move', direction } : STAY;
}

/**
 * 待命點（v0.6）：中線旁邊、靠自己家那一側的直行上（11×11 是 A 隊 x = 4、B 隊 x = 6），
 * 不是牆、而且離中間橫排最近的那一格；一樣近時選 y 小的。
 * 那一直行全部是牆時，待命點就是自己的重生點。
 */
export function standbyPoint(team: Team, map: GameMap): Position {
  const home = map.spawnPoints[team];
  const mid = midlineX(map);
  const x = mid + Math.sign(home.x - mid);
  const row = middleRowY(map);
  let best: Position | null = null;
  for (let y = 0; y < map.height; y++) {
    const cell = { x, y };
    if (isWall(cell, map)) continue;
    // y 由小到大看，只有「更近」才換，所以一樣近時留下 y 小的
    if (!best || Math.abs(y - row) < Math.abs(best.y - row)) best = cell;
  }
  return best ?? { ...home };
}

/**
 * 沒拿旗、要去找旗子時，照旗子的階段（規則第 8 節共用規定）：
 * - 在地上：走最短路去撿。自己剛好站在旗子上：往旁邊隨機走一步。
 * - 預告：往預告位置走，走到離預告位置一步就不動。自己剛好站在預告格上：往旁邊隨機走一步。
 * - 隱藏：走最短路到待命點，到了就不動。
 * - 其他（例如之後多人模式隊友拿著旗）：規則沒寫，先不動。
 */
export function seekFlag(self: { position: Position; team: Team }, state: PublicGameState, random: RandomSource): Action {
  const flag = state.flag;
  const map = state.map;
  const { position, team } = self;
  switch (flag.status) {
    case 'onGround':
      if (samePosition(position, flag.position)) return stepAside(position, team, map, random);
      return moveTowards(position, flag.position, team, map, random);
    case 'announced': {
      if (samePosition(position, flag.nextPosition)) return stepAside(position, team, map, random);
      if (pathDistance(position, flag.nextPosition, team, map) === 1) return STAY;
      return moveTowards(position, flag.nextPosition, team, map, random);
    }
    case 'hidden':
      return moveTowards(position, standbyPoint(team, map), team, map, random);
    case 'carried':
      return STAY;
  }
}

/**
 * 目標在不在射擊線上：同一直線、射程內、中間沒有牆（牆照場面裡的地圖）。
 * 在的話回傳射擊方向，不在回傳 null。
 */
export function shootingDirection(from: Position, target: Position, map: GameMap, shootRange: number): Direction | null {
  for (const direction of DIRECTIONS) {
    let cell = from;
    for (let distance = 1; distance <= shootRange; distance++) {
      cell = step(cell, direction);
      if (!isInsideBoard(cell, map) || isWall(cell, map)) break;
      if (samePosition(cell, target)) return direction;
    }
  }
  return null;
}
