import { describe, expect, it } from 'vitest';
import { resolveRound, type GameState } from '../core/index.ts';
import { FLAG_FAR_AWAY, characterOf, makeState, positionOf, shoot } from './helpers.ts';

describe('第 5 節步驟 6：淘汰、重生與無敵', () => {
  it('第 N 回合被淘汰，N+1、N+2 不在場，N+3 開始可以行動（出現在自己的重生點）', () => {
    // A1 站在 B 重生點旁邊 (6, 4)，B1 在 (7, 4)；第 1 回合 A1 把 B1 打倒
    let state: GameState = makeState({
      A1: { position: { x: 6, y: 4 } },
      B1: { position: { x: 7, y: 4 } },
      flag: FLAG_FAR_AWAY,
    });

    state = resolveRound(state, { A1: shoot('right') }).state; // 第 1 回合（N）
    expect(positionOf(state, 'B1')).toBeNull();

    state = resolveRound(state, {}).state; // 第 2 回合（N+1）結束：仍不在場
    expect(positionOf(state, 'B1')).toBeNull();

    const third = resolveRound(state, {}); // 第 3 回合（N+2）結束：出現在重生點
    state = third.state;
    expect(positionOf(state, 'B1')).toEqual({ x: 8, y: 4 });
    expect(third.events).toContainEqual({ type: 'respawned', characterId: 'B1', position: { x: 8, y: 4 } });
  });

  it('不在場的角色送出的動作不會生效', () => {
    const state = makeState({
      A1: { position: { x: 6, y: 4 } },
      B1: { position: null, respawnCountdown: 2 },
      flag: FLAG_FAR_AWAY,
    });
    const { events } = resolveRound(state, { B1: shoot('left') });
    expect(events.some((event) => event.type === 'shot')).toBe(false);
  });

  it('重生後無敵 2 回合，期間不會被打中', () => {
    // B1 下一回合結束時在 (8, 4) 重生，A1 站在旁邊 (7, 4) 往右射
    let state: GameState = makeState({
      A1: { position: { x: 7, y: 4 } },
      B1: { position: null, respawnCountdown: 1 },
      flag: FLAG_FAR_AWAY,
    });
    state = resolveRound(state, {}).state; // 這回合結束時 B1 重生
    expect(positionOf(state, 'B1')).toEqual({ x: 8, y: 4 });
    expect(characterOf(state, 'B1').invulnerableRoundsLeft).toBe(2);

    // 重生後第 1 回合（N+3）：打不到
    const first = resolveRound(state, { A1: shoot('right') });
    expect(positionOf(first.state, 'B1')).toEqual({ x: 8, y: 4 });
    expect(first.events).toContainEqual({ type: 'shotBlockedByInvulnerable', shooterId: 'A1', targetId: 'B1' });

    // 重生後第 2 回合（N+4）：打不到
    const second = resolveRound(first.state, { A1: shoot('right') });
    expect(positionOf(second.state, 'B1')).toEqual({ x: 8, y: 4 });
  });

  it('無敵結束後會被打中', () => {
    let state: GameState = makeState({
      A1: { position: { x: 7, y: 4 } },
      B1: { position: null, respawnCountdown: 1 },
      flag: FLAG_FAR_AWAY,
    });
    state = resolveRound(state, {}).state; // B1 重生
    state = resolveRound(state, {}).state; // 無敵第 1 回合
    state = resolveRound(state, {}).state; // 無敵第 2 回合
    expect(characterOf(state, 'B1').invulnerableRoundsLeft).toBe(0);

    const { state: next } = resolveRound(state, { A1: shoot('right') }); // 無敵已結束
    expect(positionOf(next, 'B1')).toBeNull();
  });

  it('無敵期間可以正常射擊', () => {
    const state = makeState({
      A1: { position: { x: 6, y: 4 } },
      B1: { position: { x: 8, y: 4 }, invulnerableRoundsLeft: 2 },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { B1: shoot('left') });
    expect(positionOf(next, 'A1')).toBeNull();
  });

  it('被淘汰的角色這回合選射擊，那一槍仍然有效', () => {
    const state = makeState({ A1: { position: { x: 1, y: 0 } }, B1: { position: { x: 2, y: 0 } }, flag: FLAG_FAR_AWAY });
    const { state: next } = resolveRound(state, { A1: shoot('right'), B1: shoot('left') });
    expect(positionOf(next, 'A1')).toBeNull();
    expect(positionOf(next, 'B1')).toBeNull();
  });
});
