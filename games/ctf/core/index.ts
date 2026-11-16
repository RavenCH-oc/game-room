// 奪旗遊戲核心的對外入口。

export { CTF_CONFIG, type BotChances, type CtfConfig, type MapGenerationConfig } from './config.ts';
export * from './types.ts';
export { createInitialState, DEFAULT_SEED, getCharacterView, toPublicState } from './state.ts';
export { flagCandidateCells } from './flag.ts';
export {
  allOpenCellsConnected,
  CLASSIC_MAP_9X9,
  countOpenMidlineCells,
  generateMap,
  sortWalls,
  type GeneratedMap,
} from './map.ts';
export { fnv1a, isValidSeed, MAX_SEED, nextRandom, pickIndex } from './random.ts';
export { resolveRound } from './resolve.ts';
export {
  DIRECTIONS,
  isDirection,
  isEnemySpawn,
  isInsideBoard,
  isWall,
  middleRowY,
  midlineX,
  otherTeam,
  samePosition,
  step,
} from './board.ts';
