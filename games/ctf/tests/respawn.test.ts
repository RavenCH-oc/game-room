import { describe, expect, it } from 'vitest';
import { resolveRound, type GameState } from '../core/index.ts';
import { FLAG_FAR_AWAY, characterOf, hpOf, makeState, positionOf, shoot } from './helpers.ts';

describe('第 5 節步驟 6：倒地、重生與無敵', () => {
  it('第 N 回合倒地，N+1、N+2 不在場，N+3 開始可以行動（出現在自己的重生點）', () => {
    // A1 在 (6, 4)，B1 在 (7, 4) 只剩 1 點；第 1 回合 A1 把 B1 打倒
    let state: GameState = makeState({
      A1: { position: { x: 6, y: 4 } },
      B1: { position: { x: 7, y: 4 }, hp: 1 },
      flag: FLAG_FAR_AWAY,
    });

    state = resolveRound(state, { A1: shoot('right') }).state; // 第 1 回合（N）
    expect(positionOf(state, 'B1')).toBeNull();

    state = resolveRound(state, {}).state; // 第 2 回合（N+1）結束：仍不在場
    expect(positionOf(state, 'B1')).toBeNull();

    const third = resolveRound(state, {}); // 第 3 回合（N+2）結束：出現在重生點
    state = third.state;
    expect(positionOf(state, 'B1')).toEqual({ x: 8, y: 4 });
    expect(third.events).toContainEqual({ type: 'respawned', characterId: 'B1', position: { x: 8, y: 4 }, hp: 3 });
  });

  it('重生後生命值補滿', () => {
    const state = makeState({
      A1: { position: { x: 0, y: 0 } },
      B1: { position: null, respawnCountdown: 1 },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, {});
    expect(hpOf(next, 'B1')).toBe(3);
  });

  it('生命值不會自己恢復', () => {
    let state: GameState = makeState({
      A1: { position: { x: 0, y: 0 }, hp: 1 },
      flag: FLAG_FAR_AWAY,
    });
    for (let round = 0; round < 5; round++) {
      state = resolveRound(state, {}).state;
    }
    expect(hpOf(state, 'A1')).toBe(1);
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

  it('重生後無敵 2 回合，期間不會受傷', () => {
    // B1 下一回合結束時在 (8, 4) 重生，A1 站在旁邊 (7, 4) 往右射
    let state: GameState = makeState({
      A1: { position: { x: 7, y: 4 } },
      B1: { position: null, respawnCountdown: 1 },
      flag: FLAG_FAR_AWAY,
    });
    state = resolveRound(state, {}).state; // 這回合結束時 B1 重生
    expect(positionOf(state, 'B1')).toEqual({ x: 8, y: 4 });
    expect(characterOf(state, 'B1').invulnerableRoundsLeft).toBe(2);

    // 重生後第 1 回合（N+3）：不會受傷
    const first = resolveRound(state, { A1: shoot('right') });
    expect(hpOf(first.state, 'B1')).toBe(3);
    expect(first.events).toContainEqual({ type: 'shotBlockedByInvulnerable', shooterId: 'A1', targetId: 'B1' });

    // 重生後第 2 回合（N+4）：不會受傷
    const second = resolveRound(first.state, { A1: shoot('right') });
    expect(hpOf(second.state, 'B1')).toBe(3);
  });

  it('v0.2 補充：子彈停在無敵角色身上，不會穿過去打到後面的人', () => {
    // A1 往右射：無敵的 B1 在 (2, 0)，B2 在 (3, 0)
    const state = makeState({
      A1: { position: { x: 1, y: 0 } },
      B1: { position: { x: 2, y: 0 }, invulnerableRoundsLeft: 2 },
      extra: [{ id: 'B2', team: 'B', position: { x: 3, y: 0 } }],
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { A1: shoot('right') });
    expect(hpOf(next, 'B1')).toBe(3);
    expect(hpOf(next, 'B2')).toBe(3);
  });

  it('無敵結束後會受傷', () => {
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
    expect(hpOf(next, 'B1')).toBe(2);
  });

  it('無敵期間可以正常射擊', () => {
    const state = makeState({
      A1: { position: { x: 6, y: 4 } },
      B1: { position: { x: 8, y: 4 }, invulnerableRoundsLeft: 2 },
      flag: FLAG_FAR_AWAY,
    });
    const { state: next } = resolveRound(state, { B1: shoot('left') });
    expect(hpOf(next, 'A1')).toBe(2);
  });
});
