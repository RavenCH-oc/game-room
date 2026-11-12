// 範例 AI：攻擊型（規則第 8 節，v0.5 整段重寫）。
// 每回合依照下面的順序：
//   1. 自己拿著旗：走最短路回家。
//   2. 有 15% 機率這回合不考慮開槍，直接跳到第 3 點。否則，對手在場、不是無敵時：
//      先決定瞄準哪一格：25% 機率瞄「對手現在的位置」，其餘瞄「猜對手這回合會走到的那一格」。
//      瞄的那一格在自己的射擊線上，就朝那個方向射擊。
//   3. 否則，旗子在對手手上：走最短路追他。
//   4. 否則：照共用的「去找旗子」規定。
// 兩個機率放在設定檔 games/ctf/core/config.ts 的 bots。

import {
  CTF_CONFIG,
  samePosition,
  step,
  type Bot,
  type Character,
  type CtfConfig,
  type Position,
  type PublicGameState,
} from '../core/index.ts';
import { createRoundRandom, type RandomSource } from './botRandom.ts';
import { moveTowards, seekFlag, shootingDirection, standbyPoint, stepTowards } from './pathfinding.ts';

export function createAttacker(aiSeed: number, config: CtfConfig = CTF_CONFIG): Bot {
  return (view) => {
    const { state, selfId } = view;
    const self = state.characters.find((character) => character.id === selfId);
    if (!self?.position) return { type: 'stay' };
    const position = self.position;
    const random = createRoundRandom(aiSeed, state.round, selfId);
    const flag = state.flag;

    // 1. 自己拿著旗：回家
    if (flag.status === 'carried' && flag.carrierId === selfId) {
      return moveTowards(position, config.spawnPoints[self.team], self.team, config, random);
    }

    // 2. 考慮開槍（有一定機率這回合不考慮）
    const skipShooting = random() < config.bots.attackerSkipShootingChance;
    if (!skipShooting) {
      for (const opponent of state.characters) {
        if (opponent.team === self.team || !opponent.position || opponent.invulnerableRoundsLeft > 0) continue;
        const aimAtCurrent = random() < config.bots.attackerAimAtCurrentChance;
        const target = aimAtCurrent ? opponent.position : predictNextPosition(state, opponent, position, config, random);
        const direction = shootingDirection(position, target, config);
        if (direction) return { type: 'shoot', direction };
      }
    }

    // 3. 旗子在對手手上：追他
    if (flag.status === 'carried') {
      const carrier = state.characters.find((character) => character.id === flag.carrierId);
      if (carrier && carrier.team !== self.team && carrier.position) {
        return moveTowards(position, carrier.position, self.team, config, random);
      }
    }

    // 4. 去找旗子
    return seekFlag({ position, team: self.team }, state, config, random);
  };
}

/**
 * 猜對手這回合會走到哪一格（規則第 8 節攻擊型第 2 點的猜法）：
 * - 對手拿著旗：往他家走一步
 * - 旗子在地上：往旗子走一步
 * - 預告階段：往預告位置走一步
 * - 隱藏階段：往他的待命點走一步
 * - 其他情況：不動
 * 有好幾個一樣短的方向時隨機猜一個。猜的那一格如果是自己站的位置，改猜他不動。
 */
export function predictNextPosition(
  state: PublicGameState,
  opponent: Character,
  myPosition: Position,
  config: CtfConfig,
  random: RandomSource,
): Position {
  const from = opponent.position!;
  const flag = state.flag;
  let goal: Position | null = null;
  if (flag.status === 'carried') {
    if (flag.carrierId === opponent.id) goal = config.spawnPoints[opponent.team];
  } else if (flag.status === 'onGround') {
    goal = flag.position;
  } else if (flag.status === 'announced') {
    goal = flag.nextPosition;
  } else {
    goal = standbyPoint(opponent.team, config);
  }
  if (!goal) return from;

  const direction = stepTowards(from, goal, opponent.team, config, random);
  if (!direction) return from;
  const guess = step(from, direction);
  return samePosition(guess, myPosition) ? from : guess;
}
