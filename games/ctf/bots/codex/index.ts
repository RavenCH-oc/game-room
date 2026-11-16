import {
  CTF_CONFIG, DIRECTIONS, otherTeam, resolveRound, samePosition, step,
  type Action, type Bot, type Character, type CtfConfig, type GameState, type Position, type PublicGameState,
} from '../../core/index.ts';
import { createRoundRandom } from '../botRandom.ts';
import { standbyPoint } from '../pathfinding.ts';
import { createGeometry, type Geometry } from './geometry.ts';

/** 研究選項只改策略，不改遊戲規則。正式登記使用預設值。 */
export interface StrategyOptions {
  safety: number;
  future: number;
  learning: boolean;
  depth?: number;
}
export const DEFAULT_STRATEGY: Readonly<StrategyOptions> = { safety: 0.25, future: 1, learning: true, depth: 2 };

export function legalActions(state: PublicGameState, who: Character, geo: Geometry): Action[] {
  if (!who.position) return [{ type: 'stay' }];
  const actions: Action[] = [{ type: 'stay' }];
  DIRECTIONS.forEach((direction, d) => {
    if (geo.canMove(who.position!, d, who.team)) actions.push({ type: 'move', direction });
  });
  if (state.flag.status === 'carried' && state.flag.carrierId === who.id) actions.push({ type: 'dropFlag' });
  else DIRECTIONS.forEach(direction => actions.push({ type: 'shoot', direction }));
  return actions;
}

function goal(state: PublicGameState, who: Character): Position {
  const flag = state.flag;
  if (flag.status === 'carried') {
    if (flag.carrierId === who.id) return state.map.spawnPoints[who.team];
    return state.characters.find(c => c.id === flag.carrierId)?.position ?? standbyPoint(who.team, state.map);
  }
  if (flag.status === 'onGround') return flag.position;
  if (flag.status === 'announced') return flag.nextPosition;
  return standbyPoint(who.team, state.map);
}

/** 對所有可行下一步保留機率，沒有使用對手代號、內部記憶或未結算動作。 */
function prior(state: PublicGameState, who: Character, rival: Character, actions: Action[], geo: Geometry, aggression: number): number[] {
  if (!who.position) return [1];
  const target = goal(state, who);
  const distance = geo.distance(who.position, target, who.team);
  const waiting = state.flag.status === 'announced' && distance === 1;
  const moves: number[] = actions.map(action => {
    if (action.type === 'stay') return waiting || distance === 0 ? 1 : 0.08;
    if (action.type !== 'move') return 0;
    const to = step(who.position!, action.direction);
    const after = geo.distance(to, target, who.team);
    if (distance === 0 && (state.flag.status === 'onGround' || state.flag.status === 'announced')) return 1;
    return after < distance ? (waiting ? 0.03 : 1) : 0.025;
  });
  const shotWeights = actions.map(() => 0);
  if (rival.position && rival.invulnerableRoundsLeft === 0) {
    const rivalGoal = goal(state, rival);
    const before = geo.distance(rival.position, rivalGoal, rival.team);
    const targets = [{ p: rival.position, weight: 0.35 }];
    const candidates = DIRECTIONS.filter((d, i) => geo.canMove(rival.position!, i, rival.team) &&
      geo.distance(step(rival.position!, d), rivalGoal, rival.team) < before);
    for (const d of candidates) {
      const p = step(rival.position, d);
      targets.push({ p: samePosition(p, who.position) ? rival.position : p, weight: 0.65 / candidates.length });
    }
    if (!candidates.length) targets[0]!.weight = 1;
    for (const { p, weight } of targets) {
      const d = geo.shots[geo.key(who.position)]![geo.key(p)]!;
      if (d < 0) continue;
      const i = actions.findIndex(a => a.type === 'shoot' && a.direction === DIRECTIONS[d]);
      if (i >= 0) shotWeights[i]! += weight;
    }
  }
  const shotSum = shotWeights.reduce((a, b) => a + b, 0);
  const moveSum = moves.reduce((a, b) => a + b, 0) || 1;
  const shootProbability = aggression * shotSum;
  const weights = moves.map((v, i) => (1 - shootProbability) * v / moveSum + aggression * shotWeights[i]! + 0.002);
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / total);
}

/** 隱藏旗位絕不進入評分：只推一回合，跨越抽旗邊界後立即遮蔽假的抽樣結果。 */
export function simulatePublic(state: PublicGameState, actions: Record<string, Action>, config: CtfConfig): PublicGameState {
  const complete: GameState = { ...state, seed: 0, rngState: 0 };
  const next = resolveRound(complete, actions, config).state;
  const scored = next.scores.A !== state.scores.A || next.scores.B !== state.scores.B;
  if (state.flag.status === 'hidden' || scored) {
    next.flag = { status: 'hidden', roundsLeft: scored ? config.flagHiddenRounds : Math.max(0, state.flag.status === 'hidden' ? state.flag.roundsLeft - 1 : 0) };
    next.lastFlagSpawn = state.lastFlagSpawn;
  }
  return next;
}

function evaluate(state: PublicGameState, selfId: string, geo: Geometry, config: CtfConfig, future: number): number {
  const me = state.characters.find(c => c.id === selfId)!;
  const enemy = state.characters.find(c => c.team !== me.team)!;
  const team = me.team;
  const other = otherTeam(team);
  if (state.result) return state.result.winner === team ? 10000 : state.result.winner === null ? 0 : -10000;
  let value = 220 * (state.scores[team] - state.scores[other]) + 24 * (state.knockdowns[team] - state.knockdowns[other]);
  const health = (c: Character): number => c.position ? 9 * c.hp + 3 * c.invulnerableRoundsLeft : -12 - c.respawnCountdown * 2;
  value += health(me) - health(enemy);
  const flag = state.flag;
  const distance = (c: Character, p: Position): number => c.position ? geo.distance(c.position, p, c.team) :
    c.respawnCountdown + geo.distance(state.map.spawnPoints[c.team], p, c.team);
  if (flag.status === 'carried') {
    const carrier = flag.carrierId === selfId ? me : enemy;
    const defender = carrier === me ? enemy : me;
    const sign = carrier === me ? 1 : -1;
    const homeDistance = distance(carrier, state.map.spawnPoints[carrier.team]);
    value += sign * (65 - homeDistance * 3.5);
    if (carrier.position && defender.position) {
      // 追近持旗者，但不把進不了的敵方家門當成可攔截位置。
      value += sign * 0.9 * Math.min(12, distance(defender, carrier.position));
      if (future && carrier.invulnerableRoundsLeft === 0) {
        let safe = 0;
        let progress = 0;
        for (let d = 0; d < 4; d++) {
          if (!geo.canMove(carrier.position, d, carrier.team)) continue;
          const to = step(carrier.position, DIRECTIONS[d]!);
          if (geo.shots[geo.key(defender.position)]![geo.key(to)]! < 0) {
            safe++;
            if (geo.distance(to, state.map.spawnPoints[carrier.team], carrier.team) < homeDistance) progress++;
          }
        }
        value -= sign * future * (progress ? 0 : safe ? 6 : 18);
      }
    }
  } else if (flag.status === 'onGround' || flag.status === 'announced') {
    const p = flag.status === 'onGround' ? flag.position : flag.nextPosition;
    const pickupDistance = (c: Character): number => { const d = distance(c, p); return d === 0 ? 2 : d; };
    const mine = pickupDistance(me);
    const theirs = pickupDistance(enemy);
    value += 2.5 * (theirs - mine) + 5 * Math.max(-1, Math.min(1, theirs - mine));
  } else {
    // 未預告時對所有合法候選格取平均距離，絕不猜下一次抽樣。
    const candidates = geo.cells.filter(p => p.x === Math.floor(state.map.width / 2) &&
      !state.map.walls.some(w => samePosition(p, w)) && (!state.lastFlagSpawn || !samePosition(p, state.lastFlagSpawn)));
    value += candidates.reduce((sum, p) => sum + distance(enemy, p) - distance(me, p), 0) / Math.max(1, candidates.length);
  }
  return value;
}

export function createCodex(aiSeed: number, config: CtfConfig = CTF_CONFIG, options: StrategyOptions = DEFAULT_STRATEGY): Bot {
  let geo: Geometry | undefined;
  let previous: { round: number; enemy: Character; self: Character } | undefined;
  let attackEvidence = 3;
  let passiveEvidence = 1;
  return ({ state, selfId }) => {
    const me = state.characters.find(c => c.id === selfId);
    const enemy = state.characters.find(c => c.team !== me?.team);
    if (!me?.position || !enemy || state.result) return { type: 'stay' };
    geo ??= createGeometry(state.map, config.shootRange);
    if (options.learning && previous && previous.round === state.round - 1 && previous.enemy.position && previous.self.position && me.position) {
      const stayed = enemy.position && samePosition(enemy.position, previous.enemy.position);
      if (previous.self.hp > me.hp) attackEvidence += 2;
      else if (geo.shots[geo.key(previous.enemy.position)]![geo.key(previous.self.position)]! >= 0) {
        if (stayed) attackEvidence += 0.2;
        else passiveEvidence += 0.25;
      }
    }
    previous = { round: state.round, enemy: { ...enemy }, self: { ...me } };
    const mine = legalActions(state, me, geo);
    const theirs = legalActions(state, enemy, geo);
    const probabilities = prior(state, enemy, me, theirs, geo, Math.max(0.25, Math.min(0.9, attackEvidence / (attackEvidence + passiveEvidence))));
    const random = createRoundRandom(aiSeed, state.round, selfId);
    const aggression = Math.max(0.25, Math.min(0.9, attackEvidence / (attackEvidence + passiveEvidence)));
    const combine = (values: number[], weights: number[]): number => (1 - options.safety) *
      values.reduce((sum, v, i) => sum + v * weights[i]!, 0) + options.safety * Math.min(...values);
    const continuation = (node: PublicGameState): number => {
      if (node.result) return evaluate(node, selfId, geo!, config, options.future);
      const self = node.characters.find(c => c.id === selfId)!;
      const opponent = node.characters.find(c => c.id === enemy.id)!;
      const responses = legalActions(node, opponent, geo!);
      const weights = prior(node, opponent, self, responses, geo!, aggression);
      let value = -Infinity;
      for (const action of legalActions(node, self, geo!)) {
        const values = responses.map(response => evaluate(simulatePublic(node, { [selfId]: action, [enemy.id]: response }, config), selfId, geo!, config, options.future));
        value = Math.max(value, combine(values, weights));
      }
      return value;
    };
    const rows = mine.map(action => {
      const nodes = theirs.map(response => simulatePublic(state, { [selfId]: action, [enemy.id]: response }, config));
      const values = nodes.map(node => evaluate(node, selfId, geo!, config, options.future));
      return { action, nodes, values, utility: combine(values, probabilities) };
    }).sort((a, b) => b.utility - a.utility);
    let best = -Infinity;
    let chosen: Action = { type: 'stay' };
    for (const row of rows.slice(0, options.depth === 2 ? 3 : rows.length)) {
      let utility = row.utility;
      if (options.depth === 2) {
        // 只展開最可能的三種回應；其餘保留一層估值，控制每一步成本。
        const likely = probabilities.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p).slice(0, 3);
        const values = [...row.values];
        for (const { p, i } of likely) if (p > 0.04) values[i] = 0.2 * values[i]! + 0.8 * continuation(row.nodes[i]!);
        utility = combine(values, probabilities);
      }
      utility += random() * 0.15;
      if (utility > best) { best = utility; chosen = row.action; }
    }
    return chosen;
  };
}
