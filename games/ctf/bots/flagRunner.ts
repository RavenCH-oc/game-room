// 範例 AI：搶旗（規則第 8 節，v0.5 整段重寫）。不射擊。
//   1. 自己拿著旗：走最短路回家。
//   2. 否則，有 10% 機率這回合不動。（兩個搶旗 AI 才不會永遠互相彈回。）
//   3. 否則，旗子在對手手上：往場地正中央走。
//   4. 否則：照共用的「去找旗子」規定。
// 機率放在設定檔 games/ctf/core/config.ts 的 bots。

import { CTF_CONFIG, type Bot, type CtfConfig } from '../core/index.ts';
import { createRoundRandom } from './botRandom.ts';
import { boardCenter, moveTowards, seekFlag } from './pathfinding.ts';

export function createFlagRunner(aiSeed: number, config: CtfConfig = CTF_CONFIG): Bot {
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

    // 2. 有一定機率這回合不動
    if (random() < config.bots.flagRunnerStayChance) return { type: 'stay' };

    // 3. 旗子在對手手上：往場地正中央走
    if (flag.status === 'carried') {
      const carrier = state.characters.find((character) => character.id === flag.carrierId);
      if (carrier && carrier.team !== self.team) {
        return moveTowards(position, boardCenter(config), self.team, config, random);
      }
    }

    // 4. 去找旗子
    return seekFlag({ position, team: self.team }, state, config, random);
  };
}
