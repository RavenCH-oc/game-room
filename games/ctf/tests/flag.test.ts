import { describe, expect, it } from 'vitest';
import { resolveRound, type GameState } from '../core/index.ts';
import { dropFlag, makeState, move, positionOf, stay } from './helpers.ts';

describe('第 4 節／第 5 節步驟 2、4、5：旗子', () => {
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

  it('得分後旗子 2 回合後回到中央 (4, 4)', () => {
    // 第 1 回合得分；第 2 回合結束時旗子還沒回來；第 3 回合結束時回到中央
    let state: GameState = makeState({
      A1: { position: { x: 1, y: 4 } },
      flag: { status: 'carried', carrierId: 'A1' },
    });
    state = resolveRound(state, { A1: move('left') }).state;
    expect(state.flag.status).toBe('returning');

    state = resolveRound(state, {}).state;
    expect(state.flag.status).toBe('returning');

    const third = resolveRound(state, {});
    expect(third.state.flag).toEqual({ status: 'onGround', position: { x: 4, y: 4 } });
    expect(third.events).toContainEqual({ type: 'flagReturned', position: { x: 4, y: 4 } });
  });

  it('旗子剛好在角色腳下重生，不會被撿起', () => {
    const state = makeState({
      A1: { position: { x: 4, y: 4 } },
      flag: { status: 'returning', roundsLeft: 1 },
    });
    let next = resolveRound(state, {}).state;
    expect(next.flag).toEqual({ status: 'onGround', position: { x: 4, y: 4 } });
    next = resolveRound(next, { A1: stay }).state;
    expect(next.flag.status).toBe('onGround');
    expect(positionOf(next, 'A1')).toEqual({ x: 4, y: 4 });
  });
});
