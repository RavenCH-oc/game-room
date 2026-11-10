// 範例 AI：隨機亂走。
// 每回合從「上下左右走一格、不動」裡隨機選一個。
// 為了讓同一場比賽可以重播，用「種子」產生隨機數：同樣的種子會走出同樣的路線。
// （隨機只出現在 AI 腳本裡，遊戲核心本身不用隨機。）

import type { Action, Bot } from '../core/index.ts';

const CHOICES: Action[] = [
  { type: 'move', direction: 'up' },
  { type: 'move', direction: 'down' },
  { type: 'move', direction: 'left' },
  { type: 'move', direction: 'right' },
  { type: 'stay' },
];

export function createRandomWalker(seed: number): Bot {
  const random = createSeededRandom(seed);
  return () => {
    const index = Math.floor(random() * CHOICES.length);
    return CHOICES[index] ?? { type: 'stay' };
  };
}

/** 簡單的種子隨機數產生器（mulberry32），回傳 0 到 1 之間的數 */
function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
