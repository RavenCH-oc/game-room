// 旗子快要重抽時的倒數（規則第 5 節「旗子重抽」；docs/web-v1.md 第 6 節 v0.7、v0.8）。
// 場地上方的文字（main.ts）和旗子那一格上的數字（board.ts）都用這裡算，不各算一份。

import { CTF_CONFIG, type PublicGameState } from '../../games/ctf/core/index.ts';

/** 剩幾回合以內就開始提示 */
export const FLAG_REROLL_WARNING_ROUNDS = 5;

/**
 * 旗子在地上、再 5 回合以內就要重抽時，回傳剩幾回合（1 到 5）；其他情況回傳 null。
 * 剩餘回合數 = 旗子重抽回合數 − 閒置回合數；1 表示這一回合結算完就換位置。
 */
export function flagRerollRoundsLeft(game: PublicGameState): number | null {
  const rerollRounds = CTF_CONFIG.flagRerollRounds;
  if (game.flag.status !== 'onGround' || rerollRounds <= 0) return null;
  const left = rerollRounds - game.flagIdleRounds;
  return left >= 1 && left <= FLAG_REROLL_WARNING_ROUNDS ? left : null;
}
