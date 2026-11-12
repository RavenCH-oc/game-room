import { describe, expect, it } from 'vitest';
import { createAttacker, predictNextPosition } from '../bots/attacker.ts';
import { createFlagRunner } from '../bots/flagRunner.ts';
import { createInitialState, getCharacterView, resolveRound, type GameState } from '../core/index.ts';
import { FLAG_FAR_AWAY, makeState } from './helpers.ts';

const attacker = createAttacker();
const flagRunner = createFlagRunner();
const decide = (bot: typeof attacker, state: GameState, id = 'A1') => bot(getCharacterView(state, id));

describe('第 8 節：攻擊型 AI（v0.4 會預判）', () => {
  it('對手下一步會走進射擊線時會射擊', () => {
    // B1 在 (5, 2) 往旗子 (5, 4) 走，猜他走到 (5, 3)；A1 在 (5, 6) 往上 3 格剛好打得到
    // （B1 現在的位置離 A1 有 4 格，不在射程內）
    const state = makeState({
      A1: { position: { x: 5, y: 6 } },
      B1: { position: { x: 5, y: 2 } },
      flag: { status: 'onGround', position: { x: 5, y: 4 } },
    });
    expect(decide(attacker, state)).toEqual({ type: 'shoot', direction: 'up' });
  });

  it('對手下一步會走出射擊線時不射擊', () => {
    // B1 現在就在 A1 的射擊線上 (3, 0)，但他會往下走向旗子 (3, 4)，猜他走到 (3, 1)
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'onGround', position: { x: 3, y: 4 } },
    });
    expect(decide(attacker, state).type).not.toBe('shoot');
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

  it('猜法：對手拿著旗，猜他照最短路往他家走一步', () => {
    // B1 拿旗在 (6, 0)，往家 (8, 4) 的第一步猜 (6, 1)；A1 在 (8, 1) 往左 2 格打得到
    const state = makeState({
      A1: { position: { x: 8, y: 1 } },
      B1: { position: { x: 6, y: 0 } },
      flag: { status: 'carried', carrierId: 'B1' },
    });
    expect(predictNextPosition(state, state.characters[1]!, { x: 8, y: 1 })).toEqual({ x: 6, y: 1 });
    expect(decide(attacker, state)).toEqual({ type: 'shoot', direction: 'left' });
  });

  it('猜法：旗子等待重新出現，猜他往預告位置走一步', () => {
    // B1 在 (4, 0)，預告位置 (4, 2)，(4, 1) 是牆，猜他先往左到 (3, 0)；A1 在 (3, 3) 往上 3 格
    const state = makeState({
      A1: { position: { x: 3, y: 3 } },
      B1: { position: { x: 4, y: 0 } },
      flag: { status: 'returning', roundsLeft: 2, nextPosition: { x: 4, y: 2 } },
    });
    expect(predictNextPosition(state, state.characters[1]!, { x: 3, y: 3 })).toEqual({ x: 3, y: 0 });
    expect(decide(attacker, state)).toEqual({ type: 'shoot', direction: 'up' });
  });

  it('猜法：猜的那一格是自己站的位置，改猜他不動', () => {
    // 旗子在 (1, 0)，B1 在 (3, 0) 往旗子走的第一步是 (2, 0)，但那是 A1 站的地方 → 猜他不動
    const state = makeState({
      A1: { position: { x: 2, y: 0 } },
      B1: { position: { x: 3, y: 0 } },
      flag: { status: 'onGround', position: { x: 1, y: 0 } },
    });
    expect(predictNextPosition(state, state.characters[1]!, { x: 2, y: 0 })).toEqual({ x: 3, y: 0 });
    expect(decide(attacker, state)).toEqual({ type: 'shoot', direction: 'right' });
  });

  it('猜的位置超出射程（4 格）不射擊', () => {
    // B1 往旗子 (4, 0) 走，猜他到 (4, 0)，離 A1 (0, 0) 有 4 格
    const state = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: { x: 5, y: 0 } },
      flag: { status: 'onGround', position: { x: 4, y: 0 } },
    });
    expect(decide(attacker, state).type).not.toBe('shoot');
  });

  it('中間有牆不射擊', () => {
    // 猜 B1 走到 (4, 3)，但 A1 (4, 0) 往下有牆 (4, 1)
    const state = makeState({
      A1: { position: { x: 4, y: 0 } },
      B1: { position: { x: 4, y: 2 } },
      flag: { status: 'onGround', position: { x: 4, y: 3 } },
    });
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

  it('旗子在對手手上（猜的位置不在射擊線上）：走最短路追他', () => {
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
