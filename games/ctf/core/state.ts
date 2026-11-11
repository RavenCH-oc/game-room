// 開場的場面，以及給 AI 腳本看的場面。

import { CTF_CONFIG, type CtfConfig } from './config.ts';
import type { Character, CharacterView, GameState, Position } from './types.ts';

/** 第 n 次出現的旗子位置（n 從 0 開始；開場是第 0 次），照設定的順序輪流 */
export function flagSpawnPosition(n: number, config: CtfConfig = CTF_CONFIG): Position {
  const order = config.flagSpawnOrder;
  return order[n % order.length]!;
}

/** 建立 1v1 開場：每隊一個角色站在自己的重生點、生命值全滿，旗子在起點 */
export function createInitialState(config: CtfConfig = CTF_CONFIG): GameState {
  const characters: Character[] = [
    {
      id: 'A1',
      team: 'A',
      position: { ...config.spawnPoints.A },
      hp: config.maxHp,
      respawnCountdown: 0,
      invulnerableRoundsLeft: 0,
    },
    {
      id: 'B1',
      team: 'B',
      position: { ...config.spawnPoints.B },
      hp: config.maxHp,
      respawnCountdown: 0,
      invulnerableRoundsLeft: 0,
    },
  ];
  return {
    round: 0,
    phase: 'regular',
    scores: { A: 0, B: 0 },
    knockdowns: { A: 0, B: 0 },
    characters,
    flag: { status: 'onGround', position: { ...flagSpawnPosition(0, config) } },
    result: null,
  };
}

/**
 * 某個角色看到的場面（規則第 3 節：位置、生命值、旗子、分數、擊倒數全部公開；
 * 對方這回合的動作不在場面裡，所以本來就看不到）。
 * 給的是複本，腳本怎麼改都不會影響真正的場面。
 */
export function getCharacterView(state: GameState, characterId: string): CharacterView {
  return { selfId: characterId, state: structuredClone(state) };
}
