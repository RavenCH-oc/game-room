// 測試用的小工具：快速擺出想要的場面。
// v0.6：makeState 預設用原本的 9×9 固定地圖（CLASSIC_MAP_9X9），讓 v0.5 以前的測試照原本的座標繼續用。

import {
  CLASSIC_MAP_9X9,
  CTF_CONFIG,
  createInitialState,
  type Action,
  type Character,
  type FlagState,
  type GameMap,
  type GameState,
  type Phase,
  type Position,
  type Team,
} from '../core/index.ts';

interface CharacterSetup {
  position: Position | null;
  hp?: number;
  respawnCountdown?: number;
  invulnerableRoundsLeft?: number;
}

interface StateSetup {
  A1?: CharacterSetup;
  B1?: CharacterSetup;
  /** 額外的角色（1v1 以外的情況，例如「同一回合被兩人打中」） */
  extra?: (CharacterSetup & { id: string; team: Team })[];
  flag?: FlagState;
  scores?: Record<Team, number>;
  knockdowns?: Record<Team, number>;
  round?: number;
  phase?: Phase;
  /** 比賽種子（預設 1） */
  seed?: number;
  /** 地圖（預設 9×9 固定地圖） */
  map?: GameMap;
}

function applySetup(character: Character, setup: CharacterSetup): void {
  character.position = setup.position ? { ...setup.position } : null;
  character.hp = setup.hp ?? (setup.position ? CTF_CONFIG.maxHp : 0);
  character.respawnCountdown = setup.respawnCountdown ?? (setup.position ? 0 : 2);
  character.invulnerableRoundsLeft = setup.invulnerableRoundsLeft ?? 0;
}

/** 從開場出發，只改掉指定的部分 */
export function makeState(setup: StateSetup = {}): GameState {
  const state = createInitialState(CTF_CONFIG, setup.seed ?? 1, setup.map ?? CLASSIC_MAP_9X9);
  if (setup.A1) applySetup(state.characters[0]!, setup.A1);
  if (setup.B1) applySetup(state.characters[1]!, setup.B1);
  for (const extra of setup.extra ?? []) {
    const character: Character = {
      id: extra.id,
      team: extra.team,
      position: null,
      hp: 0,
      respawnCountdown: 0,
      invulnerableRoundsLeft: 0,
    };
    applySetup(character, extra);
    state.characters.push(character);
  }
  if (setup.flag) state.flag = setup.flag;
  if (setup.scores) state.scores = { ...setup.scores };
  if (setup.knockdowns) state.knockdowns = { ...setup.knockdowns };
  if (setup.round !== undefined) state.round = setup.round;
  if (setup.phase) state.phase = setup.phase;
  return state;
}

export function positionOf(state: GameState, id: string): Position | null {
  return characterOf(state, id).position;
}

export function hpOf(state: GameState, id: string): number {
  return characterOf(state, id).hp;
}

export function characterOf(state: GameState, id: string): Character {
  return state.characters.find((character) => character.id === id)!;
}

export const move = (direction: 'up' | 'down' | 'left' | 'right'): Action => ({ type: 'move', direction });
export const shoot = (direction: 'up' | 'down' | 'left' | 'right'): Action => ({ type: 'shoot', direction });
export const dropFlag: Action = { type: 'dropFlag' };
export const stay: Action = { type: 'stay' };

/** 把旗子放到遠處，避免干擾不相關的測試 */
export const FLAG_FAR_AWAY: FlagState = { status: 'onGround', position: { x: 8, y: 8 } };
