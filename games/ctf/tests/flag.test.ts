import { describe, expect, it } from 'vitest';
import { resolveRound, type GameState } from '../core/index.ts';
import { dropFlag, makeState, move, positionOf, stay } from './helpers.ts';

describe('第 4 節／第 5 節步驟 1、3、4：旗子', () => {
  it('沒拿旗的角色走進旗子那格會自動撿起', () => {
    const state = makeState({ A1: { position: { x: 3, y: 4 } } });
    const { state: next, events } = resolveRound(state, { A1: move('right') });
    expect(next.flag).toEqual({ status: 'carried', carrierId: 'A1' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'flagPickedUp', characterId: 'A1' }));
  });

  it('放下旗子：旗子留在腳下那一格', () => {
    const state = makeState({
      A1: { position: { x: 2, y: 2 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next } = resolveRound(state, { A1: dropFlag });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 2, y: 2 } });
  });

  it('沒拿旗的角色放旗被當作不動', () => {
    const state = makeState({ A1: { position: { x: 2, y: 2 } } });
    const { state: next, events } = resolveRound(state, { A1: dropFlag });
    expect(next.flag).toEqual(state.flag);
    expect(events).toContainEqual(expect.objectContaining({ type: 'invalidAction', characterId: 'A1' }));
  });

  it('放下旗子後不會自動撿回，離開再走進來才會撿起', () => {
    let state: GameState = makeState({
      A1: { position: { x: 2, y: 2 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });

    state = resolveRound(state, { A1: dropFlag }).state;
    expect(state.flag.status).toBe('onGround');

    // 站著不動：不會撿起
    state = resolveRound(state, { A1: stay }).state;
    expect(state.flag).toEqual({ status: 'onGround', position: { x: 2, y: 2 } });

    // 離開
    state = resolveRound(state, { A1: move('up') }).state;
    expect(state.flag.status).toBe('onGround');

    // 再走進來：撿起
    state = resolveRound(state, { A1: move('down') }).state;
    expect(state.flag).toEqual({ status: 'carried', carrierId: 'A1' });
  });

  it('走進一格但被彈回，不算走進旗子那格', () => {
    // 兩人都想走進旗子 (4, 4)：同格衝突彈回，誰都沒撿到
    const state = makeState({ A1: { position: { x: 3, y: 4 } }, B1: { position: { x: 5, y: 4 } } });
    const { state: next } = resolveRound(state, { A1: move('right'), B1: move('left') });
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 4, y: 4 } });
  });

  it('帶旗回到自己重生點得分，旗子消失', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next, events } = resolveRound(state, { A1: move('left') });
    expect(next.scores).toEqual({ A: 1, B: 0 });
    expect(next.flag.status).toBe('returning');
    expect(events).toContainEqual(expect.objectContaining({ type: 'scored', team: 'A', characterId: 'A1' }));
  });

  it('得分後旗子 2 回合後重新出現（第 1 次得分後在上方 (4, 2)）', () => {
    // 第 1 回合得分；第 2 回合結束時旗子還沒出現；第 3 回合結束時出現
    let state: GameState = makeState({
      A1: { position: { x: 1, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    state = resolveRound(state, { A1: move('left') }).state;
    expect(state.flag.status).toBe('returning');

    state = resolveRound(state, {}).state;
    expect(state.flag.status).toBe('returning');

    const third = resolveRound(state, {});
    expect(third.state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 2 } });
    expect(third.events).toContainEqual({ type: 'flagReturned', position: { x: 4, y: 2 } });
  });

  it('v0.3：旗子出現位置照中央、上方、下方的順序輪流，不分哪一隊得分', () => {
    // 用「得分前的總分」擺出第 1、2、3、4 次得分的場面
    const cases = [
      { scores: { A: 0, B: 0 }, scorer: 'A1', expected: { x: 4, y: 2 } }, // 第 1 次得分 → 上方
      { scores: { A: 1, B: 0 }, scorer: 'B1', expected: { x: 4, y: 6 } }, // 第 2 次得分 → 下方
      { scores: { A: 1, B: 1 }, scorer: 'A1', expected: { x: 4, y: 4 } }, // 第 3 次得分 → 中央
      { scores: { A: 2, B: 1 }, scorer: 'B1', expected: { x: 4, y: 2 } }, // 第 4 次得分 → 又是上方
    ] as const;
    for (const { scores, scorer, expected } of cases) {
      const state = makeState({
        A1: { position: scorer === 'A1' ? { x: 1, y: 4 } : { x: 0, y: 0 } },
        B1: { position: scorer === 'B1' ? { x: 7, y: 4 } : { x: 8, y: 8 } },
        flag: { status: 'carried', carrierId: scorer },
        scores,
      });
      const actions = scorer === 'A1' ? { A1: move('left') } : { B1: move('right') };
      const { state: next } = resolveRound(state, actions);
      expect(next.flag).toEqual({ status: 'returning', roundsLeft: 2, nextPosition: expected });
    }
  });

  it('v0.3：等待期間場面資訊裡有下一次出現的位置', () => {
    let state: GameState = makeState({
      A1: { position: { x: 1, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    state = resolveRound(state, { A1: move('left') }).state;
    expect(state.flag).toMatchObject({ status: 'returning', nextPosition: { x: 4, y: 2 } });
    state = resolveRound(state, {}).state;
    expect(state.flag).toEqual({ status: 'returning', roundsLeft: 1, nextPosition: { x: 4, y: 2 } });
  });

  it('旗子剛好在角色腳下重新出現，不會被撿起', () => {
    const state = makeState({
      A1: { position: { x: 4, y: 2 } },
      flag: { status: 'returning', roundsLeft: 1, nextPosition: { x: 4, y: 2 } },
    });
    let next = resolveRound(state, {}).state;
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 4, y: 2 } });
    next = resolveRound(next, { A1: stay }).state;
    expect(next.flag.status).toBe('onGround');
    expect(positionOf(next, 'A1')).toEqual({ x: 4, y: 2 });
  });
});
