// 範例 AI 的隨機（規則第 8 節「範例 AI」共用規定，v0.5）。
// - 不用 Math.random。建立 AI 時給它一個「AI 種子」，由比賽種子和角色 id 算出來。
// - AI 不記東西：每回合的亂數由（AI 種子、回合數、角色 id）算出，
//   所以同樣的場面給同一個 AI，一定回傳同樣的動作。
// 亂數算法和遊戲核心一樣用 mulberry32（核心的 nextRandom）；FNV-1a 也用核心那一份（v0.6 搬到核心）。

import { fnv1a, nextRandom } from '../core/index.ts';

/** 回傳 0（含）到 1（不含）之間的數；每呼叫一次往下取一個 */
export type RandomSource = () => number;

/**
 * AI 種子：把文字「ai:<比賽種子>:<角色 id>」做 FNV-1a 雜湊。
 * 例：比賽種子 1、角色 B1 → fnv1a("ai:1:B1")。
 * 加上「ai:」前綴，AI 的亂數就不會和核心抽旗子位置用的亂數（初始值就是比賽種子）重疊。
 */
export function deriveAiSeed(matchSeed: number, characterId: string): number {
  return fnv1a(`ai:${matchSeed}:${characterId}`);
}

/**
 * 這一回合的亂數：初始狀態是 fnv1a("<AI 種子>:<回合數>:<角色 id>")，
 * 之後每取一次用 mulberry32 往下算。回合數用場面上「已經結算完的回合數」。
 */
export function createRoundRandom(aiSeed: number, round: number, characterId: string): RandomSource {
  let state = fnv1a(`${aiSeed}:${round}:${characterId}`);
  return () => {
    const result = nextRandom(state);
    state = result.rngState;
    return result.value;
  };
}

/** 從清單裡隨機選一個（清單是空的回傳 undefined） */
export function pickOne<T>(items: readonly T[], random: RandomSource): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(random() * items.length)];
}
