// 測試用的小工具：快速擺出想要的場面。

import { createInitialState, type Action, type Character, type FlagState, type GameState, type Position, type Team } from '../core/index.ts';

interface CharacterSetup {
  position: Position | null;
  respawnCountdown?: number;
  invulnerableRoundsLeft?: number;
}

interface StateSetup {
  A1?: CharacterSetup;
  B1?: CharacterSetup;
  flag?: FlagState;
  scores?: Record<Team, number>;
  round?: number;
}

/** 從開場出發，只改掉指定的部分 */
export function makeState(setup: StateSetup = {}): GameState {
  const state = createInitialState();
  const apply = (character: Character, override?: CharacterSetup): void => {
    if (!override) return;
    character.position = override.position ? { ...override.position } : null;
    character.respawnCountdown = override.respawnCountdown ?? (override.position ? 0 : 2);
    character.invulnerableRoundsLeft = override.invulnerableRoundsLeft ?? 0;
  };
  apply(state.characters[0]!, setup.A1);
  apply(state.characters[1]!, setup.B1);
  if (setup.flag) state.flag = setup.flag;
  if (setup.scores) state.scores = { ...setup.scores };
  if (setup.round !== undefined) state.round = setup.round;
  return state;
}

export function positionOf(state: GameState, id: string): Position | null {
  return state.characters.find((character) => character.id === id)!.position;
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
