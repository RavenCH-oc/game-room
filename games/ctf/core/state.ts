// 開場的場面，以及給 AI 腳本看的場面。

import { CTF_CONFIG, type CtfConfig } from './config.ts';
import { startFlagCycle } from './flag.ts';
import { isValidSeed } from './random.ts';
import type { Character, CharacterView, GameState, PublicGameState } from './types.ts';

/** 沒指定種子時用 1（規則第 5 節「種子與亂數」） */
export const DEFAULT_SEED = 1;

/**
 * 建立 1v1 開場：每隊一個角色站在自己的重生點、生命值全滿。
 * v0.5：開局場上沒有旗子，旗子是「隱藏，剩 2 回合」。
 * seed 是這場比賽的種子（0 到 4294967295 的整數），亂數狀態的初始值就是種子。
 */
export function createInitialState(config: CtfConfig = CTF_CONFIG, seed: number = DEFAULT_SEED): GameState {
  if (!isValidSeed(seed)) {
    throw new RangeError(`種子必須是 0 到 4294967295 之間的整數，收到：${String(seed)}`);
  }
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
  const state: GameState = {
    round: 0,
    phase: 'regular',
    scores: { A: 0, B: 0 },
    knockdowns: { A: 0, B: 0 },
    characters,
    // 先放一個暫時的值，下面馬上照設定換成正確的階段
    flag: { status: 'hidden', roundsLeft: config.flagHiddenRounds },
    lastFlagSpawn: null,
    result: null,
    seed,
    rngState: seed,
  };
  // 隱藏回合數設成 0 時，開局就要抽位置（開場沒有事件清單，事件丟掉不用）
  startFlagCycle(state, config, []);
  return state;
}

/**
 * 公開的場面：拿掉種子和亂數狀態（v0.5，不然算得出下一面旗子在哪）。
 * 給的是複本，拿到的人怎麼改都不會影響真正的場面。
 */
export function toPublicState(state: GameState | PublicGameState): PublicGameState {
  const { seed: _seed, rngState: _rngState, ...rest } = state as GameState;
  return structuredClone(rest);
}

/**
 * 某個角色看到的場面（規則第 3 節：位置、生命值、旗子、分數、擊倒數全部公開；
 * 對方這回合的動作不在場面裡，所以本來就看不到；v0.5：種子和亂數狀態不給看）。
 */
export function getCharacterView(state: GameState | PublicGameState, characterId: string): CharacterView {
  return { selfId: characterId, state: toPublicState(state) };
}
