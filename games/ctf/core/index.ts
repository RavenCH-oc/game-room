// 奪旗遊戲核心的對外入口。

export { CTF_CONFIG, type BotChances, type CtfConfig } from './config.ts';
export * from './types.ts';
export { createInitialState, DEFAULT_SEED, getCharacterView, toPublicState } from './state.ts';
export { flagCandidateCells } from './flag.ts';
export { isValidSeed, MAX_SEED, nextRandom, pickIndex } from './random.ts';
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
