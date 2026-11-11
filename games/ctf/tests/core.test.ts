import { describe, expect, it } from 'vitest';
import { CTF_CONFIG, createInitialState, getCharacterView, resolveRound } from '../core/index.ts';
import { createFlagRunner } from '../bots/flagRunner.ts';
import { createRandomWalker } from '../bots/randomWalker.ts';
import { FLAG_FAR_AWAY, makeState, positionOf, shoot } from './helpers.ts';

describe('第 2 節：場地', () => {
  it('開場：A 在 (0, 4)、B 在 (8, 4)、旗子在 (4, 4)', () => {
    const state = createInitialState();
    expect(positionOf(state, 'A1')).toEqual({ x: 0, y: 4 });
    expect(positionOf(state, 'B1')).toEqual({ x: 8, y: 4 });
    expect(state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 4 } });
    expect(state.scores).toEqual({ A: 0, B: 0 });
  });

  it('第 8 節：場面包含每個角色的生命值、每隊擊倒數、是不是延長賽', () => {
    const state = createInitialState();
    expect(state.characters.map((character) => character.hp)).toEqual([3, 3]);
    expect(state.knockdowns).toEqual({ A: 0, B: 0 });
    expect(state.phase).toBe('regular');
  });
});

describe('第 7 節：設定檔', () => {
  it('初版數值和規則文件一致', () => {
    expect(CTF_CONFIG).toMatchObject({
      boardWidth: 9,
      boardHeight: 9,
      roundSeconds: 3,
      shootRange: 2,
      maxHp: 3,
      shotDamage: 1,
      winningScore: 3,
      knockedDownRounds: 2,
      invulnerableRounds: 2,
      flagReturnRounds: 2,
      regularMaxRounds: 200,
      overtimeMaxRounds: 50,
      dropFlagWhenHit: true,
    });
    expect(CTF_CONFIG.flagSpawnOrder).toEqual([
      { x: 4, y: 4 },
      { x: 4, y: 2 },
      { x: 4, y: 6 },
    ]);
    expect(CTF_CONFIG.walls).toHaveLength(6);
  });
});

describe('第 3、8 節：核心的要求', () => {
  it('沒送出動作視為「不動」', () => {
    const state = createInitialState();
    const { state: next } = resolveRound(state, {});
    expect(next.characters).toEqual(state.characters);
    expect(next.round).toBe(1);
  });

  it('不修改傳進來的場面，回傳新的', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 2, y: 0 } }, flag: FLAG_FAR_AWAY });
    const snapshot = structuredClone(state);
    const { state: next } = resolveRound(state, { A1: shoot('right') });
    expect(state).toEqual(snapshot);
    expect(next).not.toBe(state);
  });

  it('同樣的輸入得到同樣的輸出', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 2, y: 0 } }, flag: FLAG_FAR_AWAY });
    const actions = { A1: shoot('right') };
    expect(resolveRound(state, actions)).toEqual(resolveRound(state, actions));
  });

  it('收到格式錯誤的動作當作不動，不會報錯', () => {
    const state = createInitialState();
    const weird = { A1: { type: 'fly' }, B1: { type: 'move', direction: 'north' } } as never;
    expect(() => resolveRound(state, weird)).not.toThrow();
    const { state: next, events } = resolveRound(state, weird);
    expect(next.characters).toEqual(state.characters);
    expect(events.filter((event) => event.type === 'invalidAction')).toHaveLength(2);
  });

  it('角色看到的場面是複本，腳本修改不影響真正的場面', () => {
    const state = createInitialState();
    const view = getCharacterView(state, 'A1');
    view.state.scores.A = 99;
    expect(state.scores.A).toBe(0);
    expect(view.selfId).toBe('A1');
  });
});

describe('第 8 節：範例 AI 對打一整場', () => {
  it('範例 AI 在新規則下能打完一整場（隨機亂走 vs 直接搶旗）', () => {
    const bots = { A1: createRandomWalker(1), B1: createFlagRunner() };
    let state = createInitialState();
    while (!state.result) {
      const actions = {
        A1: bots.A1(getCharacterView(state, 'A1')),
        B1: bots.B1(getCharacterView(state, 'B1')),
      };
      state = resolveRound(state, actions).state;
    }
    expect(state.round).toBeLessThanOrEqual(250);
    expect(state.result).not.toBeNull();
  });
});
