import { otherTeam, type GameMap, type Position, type Team } from '../../core/index.ts';
import type { Geometry } from '../../bots/codex/geometry.ts';

/** 每次決策重新建立；把公開對手目前可射擊的格子視為較昂貴的路段。 */
export function createRiskRoutes(geo: Geometry, map: GameMap) {
  const cache = new Map<string, Float64Array>();
  return (from: Position, goal: Position, enemy: Position, team: Team): number => {
    const target = geo.key(goal);
    const shooter = geo.key(enemy);
    const signature = `${team}:${target}:${shooter}`;
    let distances = cache.get(signature);
    if (!distances) {
      distances = new Float64Array(geo.cells.length).fill(999);
      distances[target] = 0;
      const queue = [target];
      const queued = new Set(queue);
      const forbidden = geo.key(map.spawnPoints[otherTeam(team)]);
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head]!;
        queued.delete(at);
        const cost = 1 + (geo.shots[shooter]![at]! >= 0 ? 5 : 0);
        for (const previous of geo.next[at]!) {
          if (previous < 0 || previous === forbidden) continue;
          const nextDistance = distances[at]! + cost;
          if (nextDistance >= distances[previous]!) continue;
          distances[previous] = nextDistance;
          if (!queued.has(previous)) { queue.push(previous); queued.add(previous); }
        }
      }
      cache.set(signature, distances);
    }
    return distances[geo.key(from)]!;
  };
}
