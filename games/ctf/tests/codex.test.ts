import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createBot } from '../bots/index.ts';
import { createCodex, legalActions, simulatePublic } from '../bots/codex/index.ts';
import { createGeometry } from '../bots/codex/geometry.ts';
import { CTF_CONFIG, createInitialState, getCharacterView, resolveRound, toPublicState, otherTeam,
  type Action, type GameState, type Position } from '../core/index.ts';
import { canEnter } from '../bots/pathfinding.ts';
import { step } from '../core/index.ts';
import { makeState } from './helpers.ts';

function trace(seed: number, team: 'A' | 'B', check = false): string {
  let state = createInitialState(CTF_CONFIG, seed);
  const bots = { A1: createBot(team === 'A' ? 'codex' : 'attacker', seed, 'A1'), B1: createBot(team === 'B' ? 'codex' : 'attacker', seed, 'B1') };
  const hash = createHash('sha256');
  while (!state.result) {
    const actions: Record<string, Action> = {};
    for (const c of state.characters) {
      if (!c.position) continue;
      const view = getCharacterView(state, c.id);
      const before = check ? JSON.stringify(view) : '';
      const action = bots[c.id as 'A1' | 'B1'](view);
      actions[c.id] = action;
      if (check && c.team === team) {
        expect(JSON.stringify(view)).toBe(before);
        if (action.type === 'move') expect(canEnter(step(c.position, action.direction), c.team, state.map)).toBe(true);
      }
    }
    const output = resolveRound(state, actions);
    if (check) expect(output.events.filter(e => e.type === 'invalidAction')).toEqual([]);
    hash.update(JSON.stringify({ actions, ...output }));
    state = output.state;
  }
  return hash.digest('hex');
}

describe('Codex 合法性與可重現性', () => {
  it('同種子雙方重建後，兩隊逐回合動作、事件及完整場面完全相同', () => {
    for (const seed of [0, 17, 4294967295]) {
      for (const team of ['A', 'B'] as const) expect(trace(seed, team)).toBe(trace(seed, team));
    }
  }, 120000);

  it('50 場兩隊輪替，所有動作合法且不修改輸入', () => {
    for (let seed = 1; seed <= 50; seed++) trace(seed, seed % 2 ? 'A' : 'B', true);
  }, 120000);

  it('推演跨過未知旗位時遮蔽假位置；已預告旗位正常出現', () => {
    const state = toPublicState(createInitialState());
    state.flag = { status: 'hidden', roundsLeft: 1 };
    const hidden = simulatePublic(state, {}, CTF_CONFIG);
    expect(hidden.flag).toEqual({ status: 'hidden', roundsLeft: 0 });
    expect(hidden.lastFlagSpawn).toBeNull();
    state.flag = { status: 'announced', roundsLeft: 1, nextPosition: { x: 5, y: 2 } };
    expect(simulatePublic(state, {}, CTF_CONFIG).flag).toEqual({ status: 'onGround', position: { x: 5, y: 2 } });
  });

  it('得分優先於射擊，零等待設定也不使用假的下一面旗位', () => {
    const state = makeState({ A1: { position: { x: 1, y: 4 }, hp: 1 }, B1: { position: { x: 0, y: 3 } }, flag: { status: 'carried', carrierId: 'A1' } });
    const next = simulatePublic(state, { A1: { type: 'move', direction: 'left' }, B1: { type: 'shoot', direction: 'down' } }, { ...CTF_CONFIG, flagHiddenRounds: 0, flagAnnounceRounds: 0 });
    expect(next.scores.A).toBe(1);
    expect(next.characters[0]!.position).toBeNull();
    expect(next.flag.status).toBe('hidden');
  });

  it('同格衝突與交換位置採用核心結算；持旗只列移動、不動、放旗', () => {
    const state = makeState({ A1: { position: { x: 3, y: 2 } }, B1: { position: { x: 5, y: 2 } }, flag: { status: 'carried', carrierId: 'A1' } });
    const next = simulatePublic(state, { A1: { type: 'move', direction: 'right' }, B1: { type: 'move', direction: 'left' } }, CTF_CONFIG);
    expect(next.characters.map(c => c.position)).toEqual(state.characters.map(c => c.position));
    state.characters[1]!.position = { x: 4, y: 2 };
    const swap = simulatePublic(state, { A1: { type: 'move', direction: 'right' }, B1: { type: 'move', direction: 'left' } }, CTF_CONFIG);
    expect(swap.characters.map(c => c.position)).toEqual(state.characters.map(c => c.position));
    expect(legalActions(state, state.characters[0]!, createGeometry(state.map, 3)).some(a => a.type === 'shoot')).toBe(false);
  });

  it('同公開場面不受真實種子與亂數狀態影響，也沒有跨場記憶', () => {
    const first = createInitialState();
    const second = { ...first, seed: 777, rngState: 888 };
    const a = createCodex(52);
    const b = createCodex(52);
    expect(a(getCharacterView(first, 'A1'))).toEqual(b(getCharacterView(second, 'A1')));
    const fresh = createCodex(52);
    expect(fresh(getCharacterView(first, 'A1'))).toEqual(createCodex(52)(getCharacterView(first, 'A1')));
  });

  it('低血量持旗踏進家門仍優先得分；延長賽立即擊倒可取勝', () => {
    const home = makeState({ A1: { position: { x: 1, y: 4 }, hp: 1 }, B1: { position: { x: 0, y: 3 } }, flag: { status: 'carried', carrierId: 'A1' } });
    expect(createCodex(1)(getCharacterView(home, 'A1'))).toEqual({ type: 'move', direction: 'left' });
    const overtime = makeState({ A1: { position: { x: 3, y: 2 }, invulnerableRoundsLeft: 1 }, B1: { position: { x: 5, y: 2 }, hp: 1 }, phase: 'overtime', round: 200, flag: { status: 'carried', carrierId: 'B1' } });
    const action = createCodex(1)(getCharacterView(overtime, 'A1'));
    expect(action).toEqual({ type: 'shoot', direction: 'right' });
  });
});

/** 左右鏡射並交換隊伍，保留角色 id 與 AI 種子來隔離隨機差異。 */
function mirror(state: GameState): GameState {
  const result = structuredClone(state);
  const flip = (p: Position): Position => ({ x: state.map.width - 1 - p.x, y: p.y });
  result.map.walls = state.map.walls.map(flip).sort((a, b) => a.y - b.y || a.x - b.x);
  result.map.spawnPoints = { A: flip(state.map.spawnPoints.B), B: flip(state.map.spawnPoints.A) };
  result.characters = state.characters.map(c => ({ ...c, team: otherTeam(c.team), position: c.position ? flip(c.position) : null }));
  result.scores = { A: state.scores.B, B: state.scores.A };
  result.knockdowns = { A: state.knockdowns.B, B: state.knockdowns.A };
  if (result.flag.status === 'onGround') result.flag.position = flip(result.flag.position);
  if (result.flag.status === 'announced') result.flag.nextPosition = flip(result.flag.nextPosition);
  if (result.lastFlagSpawn) result.lastFlagSpawn = flip(result.lastFlagSpawn);
  return result;
}

it('不同種子與隊伍的左右鏡射決策對稱', () => {
  for (let seed = 1; seed <= 20; seed++) {
    let state = createInitialState(CTF_CONFIG, seed);
    const a = createBot('attacker', seed, 'A1');
    const b = createBot('attacker', seed, 'B1');
    for (let round = 0; round < seed; round++) state = resolveRound(state, { A1: a(getCharacterView(state, 'A1')), B1: b(getCharacterView(state, 'B1')) }).state;
    const reflected = mirror(state);
    const first = createCodex(seed)(getCharacterView(state, 'A1'));
    const second = createCodex(seed)(getCharacterView(reflected, 'A1'));
    const expected = first.type === 'move' || first.type === 'shoot' ? { ...first, direction: first.direction === 'left' ? 'right' : first.direction === 'right' ? 'left' : first.direction } : first;
    expect(second, `種子 ${seed}`).toEqual(expected);
  }
});
