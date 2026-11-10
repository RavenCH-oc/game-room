// 範例 AI：直接搶旗回家。
// 沒拿旗：走最短路去旗子那格。拿到旗：走最短路回自己的重生點。
// 不射擊、不躲人；旗子不在場上（得分後等待中）時就往中央走。

import {
  CTF_CONFIG,
  DIRECTIONS,
  isEnemySpawn,
  isInsideBoard,
  isWall,
  samePosition,
  step,
  type Action,
  type Bot,
  type CtfConfig,
  type Direction,
  type Position,
  type Team,
} from '../core/index.ts';

export function createFlagRunner(config: CtfConfig = CTF_CONFIG): Bot {
  return (view) => {
    const { state, selfId } = view;
    const self = state.characters.find((character) => character.id === selfId);
    if (!self?.position) return { type: 'stay' };

    const flag = state.flag;
    let goal: Position;
    if (flag.status === 'carried' && flag.carrierId === selfId) {
      goal = config.spawnPoints[self.team];
    } else if (flag.status === 'onGround') {
      goal = flag.position;
      // 站在旗子上不會撿起，要先離開再走回來
      if (samePosition(self.position, goal)) {
        return stepAside(self.position, self.team, config);
      }
    } else {
      goal = config.flagStart;
    }

    const direction = firstStepTowards(self.position, goal, self.team, config);
    return direction ? { type: 'move', direction } : { type: 'stay' };
  };
}

function canEnter(position: Position, team: Team, config: CtfConfig): boolean {
  return isInsideBoard(position, config) && !isWall(position, config) && !isEnemySpawn(position, team, config);
}

function stepAside(position: Position, team: Team, config: CtfConfig): Action {
  for (const direction of DIRECTIONS) {
    if (canEnter(step(position, direction), team, config)) {
      return { type: 'move', direction };
    }
  }
  return { type: 'stay' };
}

/** 廣度優先搜尋找最短路，回傳第一步的方向；已經在終點或走不到時回傳 null */
function firstStepTowards(
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
