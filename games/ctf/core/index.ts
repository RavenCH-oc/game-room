// 奪旗遊戲核心的對外入口。

export { CTF_CONFIG, type CtfConfig } from './config.ts';
export * from './types.ts';
export { createInitialState, flagSpawnPosition, getCharacterView } from './state.ts';
export { resolveRound } from './resolve.ts';
export {
  DIRECTIONS,
  isDirection,
  isEnemySpawn,
  isInsideBoard,
  isWall,
  otherTeam,
  samePosition,
  step,
} from './board.ts';
