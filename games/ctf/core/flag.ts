// 旗子的三個階段：隱藏 → 預告 → 出現（規則第 5 節，v0.5）。
// 這裡的函式都只改「傳進來的那份新場面」（結算時已經是複本），不碰原本的場面。

import { isWall, samePosition } from './board.ts';
import type { CtfConfig } from './config.ts';
import { nextRandom, pickIndex } from './random.ts';
import type { GameEvent, GameState, Position } from './types.ts';

/** 旗子可能出現的格子：中線（x = 場地寬度除以 2 的整數部分）上不是牆的格子，照 y 由小到大 */
export function flagCandidateCells(config: CtfConfig): Position[] {
  const x = Math.floor(config.boardWidth / 2);
  const cells: Position[] = [];
  for (let y = 0; y < config.boardHeight; y++) {
    const cell = { x, y };
    if (!isWall(cell, config)) cells.push(cell);
  }
  return cells;
}

/**
 * 抽下一面旗子的位置（在「進入預告」的那一刻才抽）：
 * 候選格去掉上一面旗子出現的那一格，再用亂數抽一個。每抽一次剛好取一次亂數。
 * 會把新的亂數狀態寫回 state。
 */
export function drawFlagPosition(state: GameState, config: CtfConfig): Position {
  const last = state.lastFlagSpawn;
  const candidates = flagCandidateCells(config).filter((cell) => !last || !samePosition(cell, last));
  const { value, rngState } = nextRandom(state.rngState);
  state.rngState = rngState;
  return { ...candidates[pickIndex(value, candidates.length)]! };
}

/**
 * 開局和得分時：旗子變成「隱藏，剩 N 回合」。
 * 隱藏回合數是 0 時直接抽位置進入預告；預告也是 0 時旗子立刻在場上。
 */
export function startFlagCycle(state: GameState, config: CtfConfig, events: GameEvent[]): void {
  if (config.flagHiddenRounds > 0) {
    state.flag = { status: 'hidden', roundsLeft: config.flagHiddenRounds };
    return;
  }
  announceFlag(state, config, events);
}

/**
 * 步驟 6：旗子階段的倒數（這回合才得分的不減，由呼叫的人判斷）。
 * - 隱藏減到 0：抽位置，變成「預告，剩 N 回合」。同一回合不再減預告的回合數。
 * - 預告減到 0：旗子出現在預告的那一格。
 */
export function advanceFlagStage(state: GameState, config: CtfConfig, events: GameEvent[]): void {
  const flag = state.flag;
  if (flag.status === 'hidden') {
    const roundsLeft = flag.roundsLeft - 1;
    if (roundsLeft > 0) {
      state.flag = { status: 'hidden', roundsLeft };
    } else {
      announceFlag(state, config, events);
    }
    return;
  }
  if (flag.status === 'announced') {
    const roundsLeft = flag.roundsLeft - 1;
    if (roundsLeft > 0) {
      state.flag = { ...flag, roundsLeft };
    } else {
      placeFlag(state, flag.nextPosition, events);
    }
  }
}

/** 抽出位置、進入預告；預告回合數是 0 時直接出現 */
function announceFlag(state: GameState, config: CtfConfig, events: GameEvent[]): void {
  const position = drawFlagPosition(state, config);
  if (config.flagAnnounceRounds > 0) {
    state.flag = { status: 'announced', roundsLeft: config.flagAnnounceRounds, nextPosition: position };
    events.push({ type: 'flagAnnounced', position: { ...position }, roundsLeft: config.flagAnnounceRounds });
    return;
  }
  placeFlag(state, position, events);
}

/** 旗子出現在地上，並記住這一格（下一次抽位置時要去掉） */
function placeFlag(state: GameState, position: Position, events: GameEvent[]): void {
  state.flag = { status: 'onGround', position: { ...position } };
  state.lastFlagSpawn = { ...position };
  events.push({ type: 'flagAppeared', position: { ...position } });
}
