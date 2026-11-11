// 範例 AI 共用的小工具：找最短路、判斷射擊線。
// 只用來「決定要做什麼」；真正的結果還是由遊戲核心結算。

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
  type Team,
} from '../core/index.ts';

/** 這一隊的角色能不能走進這格（不看其他角色） */
export function canEnter(position: Position, team: Team, config: CtfConfig): boolean {
  return isInsideBoard(position, config) && !isWall(position, config) && !isEnemySpawn(position, team, config);
}

/** 站在旗子上不會撿起，要先離開：往第一個能走的方向走一步 */
export function stepAside(position: Position, team: Team, config: CtfConfig): Action {
  for (const direction of DIRECTIONS) {
    if (canEnter(step(position, direction), team, config)) {
      return { type: 'move', direction };
    }
  }
  return { type: 'stay' };
}

/** 往目標走一步的動作；已經在目標上或走不到時「不動」 */
export function moveTowards(start: Position, goal: Position, team: Team, config: CtfConfig): Action {
  const direction = firstStepTowards(start, goal, team, config);
  return direction ? { type: 'move', direction } : { type: 'stay' };
}

/**
 * 廣度優先搜尋找最短路，回傳第一步的方向；已經在終點或走不到時回傳 null。
 * 目標格本身就算有角色站著也可以當終點（例如追人）。
 */
export function firstStepTowards(
  start: Position,
  goal: Position,
  team: Team,
  config: CtfConfig,
): Direction | null {
  if (samePosition(start, goal)) return null;

  const key = (position: Position): string => `${position.x},${position.y}`;
  const visited = new Set<string>([key(start)]);
  const queue: { position: Position; firstDirection: Direction }[] = [];

  for (const direction of DIRECTIONS) {
    const next = step(start, direction);
    if (!canEnter(next, team, config)) continue;
    if (samePosition(next, goal)) return direction;
    visited.add(key(next));
    queue.push({ position: next, firstDirection: direction });
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const direction of DIRECTIONS) {
      const next = step(current.position, direction);
      if (visited.has(key(next)) || !canEnter(next, team, config)) continue;
      if (samePosition(next, goal)) return current.firstDirection;
      visited.add(key(next));
      queue.push({ position: next, firstDirection: current.firstDirection });
    }
  }
  return null;
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
