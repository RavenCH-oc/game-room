// 範例 AI：隨機亂走（規則第 8 節）。
// 每回合從「上下左右走一格、不動」裡隨機選一個。
// v0.5：不記東西，每回合的亂數由（AI 種子、回合數、角色 id）算出。

import type { Action, Bot } from '../core/index.ts';
import { createRoundRandom, pickOne } from './botRandom.ts';

const CHOICES: Action[] = [
  { type: 'move', direction: 'up' },
  { type: 'move', direction: 'down' },
  { type: 'move', direction: 'left' },
  { type: 'move', direction: 'right' },
  { type: 'stay' },
];

export function createRandomWalker(aiSeed: number): Bot {
  return (view) => {
    const random = createRoundRandom(aiSeed, view.state.round, view.selfId);
    return pickOne(CHOICES, random) ?? { type: 'stay' };
  };
}
