import { DIRECTIONS, step, type Bot, type CtfConfig, type Action, type Position } from '../../core/index.ts';
import { createGeometry, type Geometry } from '../../bots/codex/geometry.ts';
import { createRoundRandom } from '../../bots/botRandom.ts';
import { standbyPoint } from '../../bots/pathfinding.ts';

/** 陪練獨立使用位置規則，不使用 Codex 的評分或對手模型。 */
export function createSparring(style: 'defender' | 'interceptor' | 'evasive', seed: number, config: CtfConfig): Bot {
  let geo: Geometry | undefined;
  return ({ state, selfId }) => {
    const self = state.characters.find(c => c.id === selfId)!;
    const enemy = state.characters.find(c => c.team !== self.team)!;
    if (!self.position) return { type: 'stay' };
    geo ??= createGeometry(state.map, config.shootRange);
    const random = createRoundRandom(seed, state.round, selfId);
    const carrier = state.flag.status === 'carried' ? state.flag.carrierId : null;
    let target: Position = standbyPoint(self.team, state.map);
    if (carrier === selfId) target = state.map.spawnPoints[self.team];
    else if (carrier && enemy.position) {
      target = enemy.position;
      if (style === 'interceptor') {
        const home = state.map.spawnPoints[enemy.team];
        const route = geo.cells.filter(p => geo!.distance(enemy.position!, p, enemy.team) + geo!.distance(p, home, enemy.team) === geo!.distance(enemy.position!, home, enemy.team));
        route.sort((a, b) => geo!.distance(self.position!, a, self.team) - geo!.distance(self.position!, b, self.team));
        target = route[0] ?? target;
      }
    } else if (state.flag.status === 'onGround') target = state.flag.position;
    else if (state.flag.status === 'announced') target = state.flag.nextPosition;
    if (style === 'defender' && carrier !== selfId && enemy.position && geo.distance(self.position, enemy.position, self.team) < 6) target = enemy.position;
    const options: { action: Action; score: number }[] = [];
    const assess = (p: Position): number => {
      let score = -geo!.distance(p, target, self.team);
      if (geo!.key(p) === geo!.key(target) && state.flag.status === 'announced') score -= 2;
      if (geo!.key(self.position!) === geo!.key(target) && geo!.key(p) !== geo!.key(target)) score += 3;
      if (enemy.position && carrier !== enemy.id && self.invulnerableRoundsLeft === 0 && geo!.shots[geo!.key(enemy.position)]![geo!.key(p)]! >= 0) {
        score -= style === 'evasive' ? 12 : carrier === selfId ? 6 : 2;
      }
      if (enemy.position && geo!.key(p) === geo!.key(enemy.position)) score -= 4;
      return score;
    };
    options.push({ action: { type: 'stay' }, score: assess(self.position) - 0.2 });
    DIRECTIONS.forEach((direction, d) => {
      if (geo!.canMove(self.position!, d, self.team)) options.push({ action: { type: 'move', direction }, score: assess(step(self.position!, direction)) });
    });
    if (carrier !== selfId && enemy.position && enemy.invulnerableRoundsLeft === 0) {
      const positions = [enemy.position];
      const enemyTarget = carrier === enemy.id ? state.map.spawnPoints[enemy.team] : target;
      DIRECTIONS.forEach((direction, d) => {
        const to = step(enemy.position!, direction);
        if (geo!.canMove(enemy.position!, d, enemy.team) && geo!.distance(to, enemyTarget, enemy.team) < geo!.distance(enemy.position!, enemyTarget, enemy.team)) positions.push(to);
      });
      DIRECTIONS.forEach((direction, d) => {
        const hits = positions.filter(p => geo!.shots[geo!.key(self.position!)]![geo!.key(p)] === d).length / positions.length;
        if (hits > 0) options.push({ action: { type: 'shoot', direction }, score: assess(self.position!) + hits * (enemy.hp === 1 ? 16 : 8) });
      });
    }
    options.forEach(o => { o.score += random() * 0.5; });
    options.sort((a, b) => b.score - a.score);
    return options[0]!.action;
  };
}
