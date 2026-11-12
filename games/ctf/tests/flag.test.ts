import { describe, expect, it } from 'vitest';
import { resolveRound, type FlagState, type GameState } from '../core/index.ts';
import { dropFlag, makeState, move, positionOf, stay } from './helpers.ts';

// v0.5：開局場上沒有旗子，所以需要旗子在地上的測試都直接擺出旗子
const FLAG_AT_CENTER: FlagState = { status: 'onGround', position: { x: 4, y: 4 } };

describe('第 4 節／第 5 節步驟 1、3、4：旗子', () => {
  it('沒拿旗的角色走進旗子那格會自動撿起', () => {
    const state = makeState({ A1: { position: { x: 3, y: 4 } }, flag: FLAG_AT_CENTER });
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
    const state = makeState({ A1: { position: { x: 2, y: 2 } }, flag: FLAG_AT_CENTER });
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
    const state = makeState({ A1: { position: { x: 3, y: 4 } }, B1: { position: { x: 5, y: 4 } }, flag: FLAG_AT_CENTER });
    const { state: next } = resolveRound(state, { A1: move('right'), B1: move('left') });
    expect(next.flag).toEqual(FLAG_AT_CENTER);
  });

  it('帶旗回到自己重生點得分，旗子消失（v0.5：變成隱藏，剩 2 回合）', () => {
    const state = makeState({
      A1: { position: { x: 1, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    const { state: next, events } = resolveRound(state, { A1: move('left') });
    expect(next.scores).toEqual({ A: 1, B: 0 });
    expect(next.flag).toEqual({ status: 'hidden', roundsLeft: 2 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'scored', team: 'A', characterId: 'A1' }));
  });
});
