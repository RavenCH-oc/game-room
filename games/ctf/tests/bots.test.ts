import { describe, expect, it } from 'vitest';
import { createAttacker } from '../bots/attacker.ts';
import { createFlagRunner } from '../bots/flagRunner.ts';
import { createInitialState, getCharacterView, resolveRound, type GameState } from '../core/index.ts';
import { FLAG_FAR_AWAY, makeState } from './helpers.ts';

const attacker = createAttacker();
const flagRunner = createFlagRunner();
const decide = (bot: typeof attacker, state: GameState, id = 'A1') => bot(getCharacterView(state, id));

describe('第 8 節：攻擊型 AI（v0.3）', () => {
  it('對手在射擊線上（同一直線、射程內）會射擊', () => {
    const right = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    expect(decide(attacker, right)).toEqual({ type: 'shoot', direction: 'right' });

    const below = makeState({ A1: { position: { x: 0, y: 0 } }, B1: { position: { x: 0, y: 1 } }, flag: FLAG_FAR_AWAY });
    expect(decide(attacker, below)).toEqual({ type: 'shoot', direction: 'down' });
  });

  it('拿著旗時不射擊、往家走', () => {
    // 對手就在旁邊的射擊線上，但自己拿著旗 → 往家 (0, 4) 走
    const state = makeState({
      A1: { position: { x: 3, y: 4 } },
      B1: { position: { x: 4, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    expect(decide(attacker, state)).toEqual({ type: 'move', direction: 'left' });
  });

  it('對手超出射程（3 格）不射擊', () => {
    const state = makeState({ A1: { position: { x: 0, y: 0 } }, B1: { position: { x: 3, y: 0 } }, flag: FLAG_FAR_AWAY });
    expect(decide(attacker, state).type).not.toBe('shoot');
  });

  it('中間有牆不射擊', () => {
    // (4, 1) 是牆
    const state = makeState({ A1: { position: { x: 4, y: 0 } }, B1: { position: { x: 4, y: 2 } }, flag: FLAG_FAR_AWAY });
    expect(decide(attacker, state).type).not.toBe('shoot');
  });

  it('對手無敵中不射擊', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 2, y: 0 }, invulnerableRoundsLeft: 2 },
      flag: FLAG_FAR_AWAY,
    });
    expect(decide(attacker, state).type).not.toBe('shoot');
  });

  it('沒有射擊機會、旗子在地上：走最短路去撿', () => {
    const state = createInitialState(); // A1 在 (0, 4)，旗子在 (4, 4)
    expect(decide(attacker, state)).toEqual({ type: 'move', direction: 'right' });
  });

  it('旗子在對手手上（不在射擊線上）：走最短路追他', () => {
    const state = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 0, y: 6 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    expect(decide(attacker, state)).toEqual({ type: 'move', direction: 'down' });
  });

  it('旗子等待重新出現：往下一次出現的位置走', () => {
    const state = makeState({
      A1: { position: { x: 4, y: 8 } },
      B1: { position: null, respawnCountdown: 2 },
      flag: { status: 'returning', roundsLeft: 2, nextPosition: { x: 4, y: 6 } },
    });
    // (4, 7) 是牆，要繞路：第一步往左或往右都是最短路
    const action = decide(attacker, state);
    expect(action.type).toBe('move');
    expect(['left', 'right']).toContain(action.type === 'move' ? action.direction : null);
  });

  it('站在旗子上（撿不起來）時會先離開', () => {
    const state = makeState({
      A1: { position: { x: 4, y: 4 } },
      B1: { position: { x: 8, y: 0 } },
      flag: { status: 'onGround', position: { x: 4, y: 4 } },
    });
    expect(decide(attacker, state).type).toBe('move');
  });
});

describe('第 8 節：搶旗 AI', () => {
  it('v0.3：旗子等待重新出現時，往下一次出現的位置走', () => {
    const state = makeState({
      A1: { position: { x: 4, y: 0 } },
      flag: { status: 'returning', roundsLeft: 2, nextPosition: { x: 4, y: 2 } },
    });
    // (4, 1) 是牆，第一步要往左或往右繞
    const action = decide(flagRunner, state);
    expect(action.type).toBe('move');
    expect(['left', 'right']).toContain(action.type === 'move' ? action.direction : null);

    const beside = makeState({
      A1: { position: { x: 3, y: 2 } },
      flag: { status: 'returning', roundsLeft: 2, nextPosition: { x: 4, y: 2 } },
    });
    expect(decide(flagRunner, beside)).toEqual({ type: 'move', direction: 'right' });
  });

  it('不射擊', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 2, y: 0 } }, flag: FLAG_FAR_AWAY });
    expect(decide(flagRunner, state).type).not.toBe('shoot');
  });
});

describe('第 8 節：三個範例 AI 都能打完一整場', () => {
  it('攻擊型 vs 搶旗、攻擊型 vs 攻擊型都能在回合上限內結束', () => {
    const matchups = [
      { A1: createAttacker(), B1: createFlagRunner() },
      { A1: createAttacker(), B1: createAttacker() },
    ];
    for (const bots of matchups) {
      let state = createInitialState();
      while (!state.result) {
        state = resolveRound(state, {
          A1: bots.A1(getCharacterView(state, 'A1')),
          B1: bots.B1(getCharacterView(state, 'B1')),
        }).state;
      }
      expect(state.round).toBeLessThanOrEqual(250);
    }
  });
});
