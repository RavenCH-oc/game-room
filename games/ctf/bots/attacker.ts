// 範例 AI：攻擊型（規則第 8 節，v0.3）。
// 每回合依照下面的順序，選第一個符合的：
//   1. 自己拿著旗：走最短路回家。
//   2. 沒拿旗，而且對手在自己的射擊線上（同一直線、射程內、中間沒有牆、對手不是無敵）：朝他射擊。
//   3. 否則，旗子在地上：走最短路去撿。
//   4. 否則，旗子在對手手上：走最短路追他。
//   5. 否則（旗子等待重新出現）：往下一次出現的位置走。

import { CTF_CONFIG, samePosition, type Bot, type CtfConfig } from '../core/index.ts';
import { moveTowards, shootingDirection, stepAside } from './pathfinding.ts';

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

    // 2. 對手在射擊線上：射擊
    for (const opponent of state.characters) {
      if (opponent.team === self.team || !opponent.position || opponent.invulnerableRoundsLeft > 0) continue;
      const direction = shootingDirection(self.position, opponent.position, config);
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
