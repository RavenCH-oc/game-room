// 場地相關的小工具（規則第 2 節）。

import type { CtfConfig } from './config.ts';
import type { Direction, Position, Team } from './types.ts';

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

export function isInsideBoard(position: Position, config: CtfConfig): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < config.boardWidth &&
    position.y < config.boardHeight
  );
}

export function isWall(position: Position, config: CtfConfig): boolean {
  return config.walls.some((wall) => samePosition(wall, position));
}

export function otherTeam(team: Team): Team {
  return team === 'A' ? 'B' : 'A';
}

/** 對某隊角色來說，這格是不是「對方的重生點」 */
export function isEnemySpawn(position: Position, team: Team, config: CtfConfig): boolean {
  return samePosition(config.spawnPoints[otherTeam(team)], position);
}
