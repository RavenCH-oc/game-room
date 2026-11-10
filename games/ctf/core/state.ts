// 開場的場面，以及給 AI 腳本看的場面。

import { CTF_CONFIG, type CtfConfig } from './config.ts';
import type { Character, CharacterView, GameState } from './types.ts';

/** 建立 1v1 開場：每隊一個角色站在自己的重生點，旗子在起點 */
export function createInitialState(config: CtfConfig = CTF_CONFIG): GameState {
  const characters: Character[] = [
    {
      id: 'A1',
      team: 'A',
      position: { ...config.spawnPoints.A },
      respawnCountdown: 0,
      invulnerableRoundsLeft: 0,
    },
    {
      id: 'B1',
      team: 'B',
      position: { ...config.spawnPoints.B },
      respawnCountdown: 0,
      invulnerableRoundsLeft: 0,
    },
  ];
  return {
    round: 0,
    scores: { A: 0, B: 0 },
    characters,
    flag: { status: 'onGround', position: { ...config.flagStart } },
    result: null,
  };
}

/**
 * 某個角色看到的場面（規則第 3 節：位置、旗子、分數全部公開；
 * 對方這回合的動作不在場面裡，所以本來就看不到）。
 * 給的是複本，腳本怎麼改都不會影響真正的場面。
 */
export function getCharacterView(state: GameState, characterId: string): CharacterView {
  return { selfId: characterId, state: structuredClone(state) };
}
