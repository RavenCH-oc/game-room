// 範例 AI：攻擊型（規則第 8 節，v0.4 改成會預判）。
// 每回合依照下面的順序，選第一個符合的：
//   1. 自己拿著旗：走最短路回家。
//   2. 沒拿旗，而且對手在場、不是無敵：先猜對手這回合會走到哪一格，
//      那一格在自己的射擊線上就朝那個方向射擊。
//      猜法：對手拿著旗 → 照最短路往他家走一步；旗子在地上 → 往旗子走一步；
//            旗子等待重新出現 → 往預告位置走一步；其他情況 → 不動。
//      猜的那一格如果是自己站的位置，改猜他不動。
//   3. 否則，旗子在地上：走最短路去撿。
//   4. 否則，旗子在對手手上：走最短路追他。
//   5. 否則（旗子等待重新出現）：往下一次出現的位置走。

import {
  CTF_CONFIG,
  samePosition,
  step,
  type Bot,
  type Character,
  type CtfConfig,
  type GameState,
  type Position,
} from '../core/index.ts';
import { firstStepTowards, moveTowards, shootingDirection, stepAside } from './pathfinding.ts';

export function createAttacker(config: CtfConfig = CTF_CONFIG): Bot {
  return (view) => {
    const { state, selfId } = view;
    const self = state.characters.find((character) => character.id === selfId);
    if (!self?.position) return { type: 'stay' };
    const flag = state.flag;

    // 1. 自己拿著旗：回家
    if (flag.status === 'carried' && flag.carrierId === selfId) {
      return moveTowards(self.position, config.spawnPoints[self.team], self.team, config);
    }

    // 2. 預判對手這回合會走到哪一格，那一格在射擊線上就射擊
    for (const opponent of state.characters) {
      if (opponent.team === self.team || !opponent.position || opponent.invulnerableRoundsLeft > 0) continue;
      const guess = predictNextPosition(state, opponent, self.position, config);
      const direction = shootingDirection(self.position, guess, config);
      if (direction) return { type: 'shoot', direction };
    }

    // 3. 旗子在地上：去撿（站在旗子上不會撿起，要先離開再走回來）
    if (flag.status === 'onGround') {
      if (samePosition(self.position, flag.position)) return stepAside(self.position, self.team, config);
      return moveTowards(self.position, flag.position, self.team, config);
    }

    // 4. 旗子在對手手上：追他
    if (flag.status === 'carried') {
      const carrier = state.characters.find((character) => character.id === flag.carrierId);
      if (carrier?.position) return moveTowards(self.position, carrier.position, self.team, config);
      return { type: 'stay' };
    }

    // 5. 旗子等待重新出現：往下一次出現的位置走
    return moveTowards(self.position, flag.nextPosition, self.team, config);
  };
}

/**
 * 猜對手這回合會走到哪一格（規則第 8 節的猜法）。
 * 有好幾條一樣短的路時，照「上、下、左、右」的順序取第一條。
 */
export function predictNextPosition(
  state: GameState,
  opponent: Character,
  myPosition: Position,
  config: CtfConfig = CTF_CONFIG,
): Position {
  const from = opponent.position!;
  const flag = state.flag;
  let goal: Position | null = null;
  if (flag.status === 'carried' && flag.carrierId === opponent.id) {
    goal = config.spawnPoints[opponent.team]; // 拿著旗：往他家走
  } else if (flag.status === 'onGround') {
    goal = flag.position; // 旗子在地上：往旗子走
  } else if (flag.status === 'returning') {
    goal = flag.nextPosition; // 旗子等待重新出現：往預告位置走
  }
  if (!goal) return from; // 其他情況：猜他不動

  const direction = firstStepTowards(from, goal, opponent.team, config);
  if (!direction) return from;
  const guess = step(from, direction);
  // 猜的那一格是自己站的位置：改猜他不動
  return samePosition(guess, myPosition) ? from : guess;
}
