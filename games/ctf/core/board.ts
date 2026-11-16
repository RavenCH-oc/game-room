// 場地相關的小工具（規則第 2 節）。
// v0.6：場地大小、重生點、牆壁一律從場面資料裡的地圖（GameMap）讀，不從設定檔讀。

import type { Direction, GameMap, Position, Team } from './types.ts';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

const DIRECTION_DELTA: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function isDirection(value: unknown): value is Direction {
  return typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value);
}

export function step(position: Position, direction: Direction): Position {
  const delta = DIRECTION_DELTA[direction];
  return { x: position.x + delta.x, y: position.y + delta.y };
}

export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isInsideBoard(position: Position, map: GameMap): boolean {
  return position.x >= 0 && position.y >= 0 && position.x < map.width && position.y < map.height;
}

export function isWall(position: Position, map: GameMap): boolean {
  return map.walls.some((wall) => samePosition(wall, position));
}

export function otherTeam(team: Team): Team {
  return team === 'A' ? 'B' : 'A';
}

/** 對某隊角色來說，這格是不是「對方的重生點」 */
export function isEnemySpawn(position: Position, team: Team, map: GameMap): boolean {
  return samePosition(map.spawnPoints[otherTeam(team)], position);
}

/** 中線：x = 寬度除以 2 的整數部分 */
export function midlineX(map: Pick<GameMap, 'width'>): number {
  return Math.floor(map.width / 2);
}

/** 中間橫排（兩個重生點所在的那一橫排）：y = 高度除以 2 的整數部分 */
export function middleRowY(map: Pick<GameMap, 'height'>): number {
  return Math.floor(map.height / 2);
}
