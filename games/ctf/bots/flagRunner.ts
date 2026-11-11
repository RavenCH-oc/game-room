// 範例 AI：搶旗（規則第 8 節）。
// 沒拿旗：走最短路去旗子那格。拿到旗：走最短路回自己的重生點。
// 不射擊、不躲人；旗子等待重新出現時，往下一次出現的位置走（v0.3）。

import { CTF_CONFIG, flagSpawnPosition, samePosition, type Bot, type CtfConfig, type Position } from '../core/index.ts';
import { moveTowards, stepAside } from './pathfinding.ts';

export function createFlagRunner(config: CtfConfig = CTF_CONFIG): Bot {
  return (view) => {
    const { state, selfId } = view;
    const self = state.characters.find((character) => character.id === selfId);
    if (!self?.position) return { type: 'stay' };

    const flag = state.flag;
    let goal: Position;
    if (flag.status === 'carried' && flag.carrierId === selfId) {
      goal = config.spawnPoints[self.team];
    } else if (flag.status === 'onGround') {
      goal = flag.position;
      // 站在旗子上不會撿起，要先離開再走回來
      if (samePosition(self.position, goal)) {
        return stepAside(self.position, self.team, config);
      }
    } else if (flag.status === 'returning') {
      goal = flag.nextPosition;
    } else {
      // 旗子在對手手上：規則沒寫，維持舊版做法，往中央（第一個出現位置）走
      goal = flagSpawnPosition(0, config);
    }

    return moveTowards(self.position, goal, self.team, config);
  };
}
