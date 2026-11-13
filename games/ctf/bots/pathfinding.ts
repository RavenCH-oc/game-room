// 範例 AI 共用的小工具：找最短路、判斷射擊線、待命點、去找旗子（規則第 8 節「範例 AI」）。
// 只用來「決定要做什麼」；真正的結果還是由遊戲核心結算。
// 找路時不考慮其他角色擋路，只看牆壁、場外、對方重生點。

import {
  DIRECTIONS,
  isEnemySpawn,
  isInsideBoard,
  isWall,
  samePosition,
  step,
  type Action,
  type CtfConfig,
  type Direction,
  type Position,
  type PublicGameState,
  type Team,
} from '../core/index.ts';
import { pickOne, type RandomSource } from './botRandom.ts';

const STAY: Action = { type: 'stay' };

/** 這一隊的角色能不能走進這格（不看其他角色） */
export function canEnter(position: Position, team: Team, config: CtfConfig): boolean {
  return isInsideBoard(position, config) && !isWall(position, config) && !isEnemySpawn(position, team, config);
}

const key = (position: Position): string => `${position.x},${position.y}`;

/** 從目標往外的廣度優先搜尋：每一格離目標要走幾步（走不到的格子不在裡面） */
function distancesTo(goal: Position, team: Team, config: CtfConfig): Map<string, number> {
  const distances = new Map<string, number>([[key(goal), 0]]);
  const queue: Position[] = [goal];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const distance = distances.get(key(current))!;
    for (const direction of DIRECTIONS) {
      const next = step(current, direction);
      if (distances.has(key(next)) || !canEnter(next, team, config)) continue;
      distances.set(key(next), distance + 1);
      queue.push(next);
    }
  }
  return distances;
}

/** 照最短路，從 start 走到 goal 要幾步；走不到回傳 null */
export function pathDistance(start: Position, goal: Position, team: Team, config: CtfConfig): number | null {
  return distancesTo(goal, team, config).get(key(start)) ?? null;
}

/**
 * 「會讓距離變短的方向」：照最短路的步數，走一步後離目標更近的方向（照上、下、左、右排列）。
 * 已經在目標上或走不到時是空的。
 */
export function shorteningDirections(start: Position, goal: Position, team: Team, config: CtfConfig): Direction[] {
  const distances = distancesTo(goal, team, config);
  const here = distances.get(key(start));
  if (here === undefined || here === 0) return [];
  return DIRECTIONS.filter((direction) => {
    const next = step(start, direction);
    return canEnter(next, team, config) && distances.get(key(next)) === here - 1;
  });
}

/** 走最短路的一步：有好幾條一樣短的路時，從會讓距離變短的方向裡隨機選一個 */
export function stepTowards(
  start: Position,
  goal: Position,
  team: Team,
  config: CtfConfig,
  random: RandomSource,
): Direction | null {
  return pickOne(shorteningDirections(start, goal, team, config), random) ?? null;
}

/** 往目標走一步的動作；已經在目標上或走不到時「不動」 */
export function moveTowards(
  start: Position,
  goal: Position,
  team: Team,
  config: CtfConfig,
  random: RandomSource,
): Action {
  const direction = stepTowards(start, goal, team, config, random);
  return direction ? { type: 'move', direction } : STAY;
}

/** 往旁邊能走的方向隨機走一步（站在旗子或預告格上時用） */
export function stepAside(position: Position, team: Team, config: CtfConfig, random: RandomSource): Action {
  const choices = DIRECTIONS.filter((direction) => canEnter(step(position, direction), team, config));
  const direction = pickOne(choices, random);
  return direction ? { type: 'move', direction } : STAY;
}

/** 場地正中央那一格 */
export function boardCenter(config: CtfConfig): Position {
  return { x: Math.floor(config.boardWidth / 2), y: Math.floor(config.boardHeight / 2) };
}

/** 待命點：中央那一格往自己家的方向一格。9×9 是 A 隊 (3, 4)、B 隊 (5, 4) */
export function standbyPoint(team: Team, config: CtfConfig): Position {
  const center = boardCenter(config);
  const home = config.spawnPoints[team];
  const dx = Math.sign(home.x - center.x);
  const dy = Math.sign(home.y - center.y);
  // 家在左右兩邊就往左右走一格，否則往上下走一格
  return dx !== 0 ? { x: center.x + dx, y: center.y } : { x: center.x, y: center.y + dy };
}

/**
 * 沒拿旗、要去找旗子時，照旗子的階段（規則第 8 節共用規定）：
 * - 在地上：走最短路去撿。自己剛好站在旗子上：往旁邊隨機走一步。
 * - 預告：往預告位置走，走到離預告位置一步就不動。自己剛好站在預告格上：往旁邊隨機走一步。
 * - 隱藏：走最短路到待命點，到了就不動。
 * - 其他（例如之後多人模式隊友拿著旗）：規則沒寫，先不動。
 */
export function seekFlag(
  self: { position: Position; team: Team },
  state: PublicGameState,
  config: CtfConfig,
  random: RandomSource,
): Action {
  const flag = state.flag;
  const { position, team } = self;
  switch (flag.status) {
    case 'onGround':
      if (samePosition(position, flag.position)) return stepAside(position, team, config, random);
      return moveTowards(position, flag.position, team, config, random);
    case 'announced': {
      if (samePosition(position, flag.nextPosition)) return stepAside(position, team, config, random);
      if (pathDistance(position, flag.nextPosition, team, config) === 1) return STAY;
      return moveTowards(position, flag.nextPosition, team, config, random);
    }
    case 'hidden':
      return moveTowards(position, standbyPoint(team, config), team, config, random);
    case 'carried':
      return STAY;
  }
}

/**
 * 目標在不在射擊線上：同一直線、射程內、中間沒有牆。
 * 在的話回傳射擊方向，不在回傳 null。
 */
export function shootingDirection(from: Position, target: Position, config: CtfConfig): Direction | null {
  for (const direction of DIRECTIONS) {
    let cell = from;
    for (let distance = 1; distance <= config.shootRange; distance++) {
      cell = step(cell, direction);
      if (!isInsideBoard(cell, config) || isWall(cell, config)) break;
      if (samePosition(cell, target)) return direction;
    }
  }
  return null;
}
