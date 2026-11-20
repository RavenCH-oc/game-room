// 這個角色現在的射程（規則第 5 節「原地連射與過熱」，v0.7）。
// AI、對打指令、網頁、結算都用這一個函式，不各寫一份。

import type { CtfConfig } from './config.ts';
import type { Character } from './types.ts';

/**
 * 這回合的射程 = 射擊距離減掉「回合開始時的原地連射次數」，最少是最短射程。
 * 剛移動過的第一槍 3 格、原地第二槍 2 格、第三槍以後 1 格。
 * 「原地連射懲罰」關掉時永遠是射擊距離。
 */
export function shootRangeOf(character: Pick<Character, 'stationaryShots'>, config: CtfConfig): number {
  if (!config.stationaryShotPenalty) return config.shootRange;
  return Math.max(config.minShootRange, config.shootRange - character.stationaryShots);
}
