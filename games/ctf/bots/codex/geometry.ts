import { DIRECTIONS, otherTeam, step, type GameMap, type Position, type Team } from '../../core/index.ts';

/** 每場獨立、只由公開地圖建立的路徑快取；第一次決策的時間包含建表。 */
export function createGeometry(map: GameMap, range: number) {
  const size = map.width * map.height;
  const key = (p: Position): number => p.y * map.width + p.x;
  const cells = Array.from({ length: size }, (_, i) => ({ x: i % map.width, y: Math.floor(i / map.width) }));
  const walls = new Set(map.walls.map(key));
  const open = (p: Position): boolean => p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height && !walls.has(key(p));
  const next = cells.map(p => DIRECTIONS.map(d => { const q = step(p, d); return open(q) ? key(q) : -1; }));
  const paths = {} as Record<Team, Int16Array[]>;
  for (const team of ['A', 'B'] as const) {
    const forbidden = key(map.spawnPoints[otherTeam(team)]);
    paths[team] = cells.map((_, goal) => {
      const dist = new Int16Array(size).fill(999);
      if (walls.has(goal) || goal === forbidden) return dist;
      const queue = [goal];
      dist[goal] = 0;
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head]!;
        for (const to of next[at]!) {
          if (to < 0 || to === forbidden || dist[to]! !== 999) continue;
          dist[to] = dist[at]! + 1;
          queue.push(to);
        }
      }
      return dist;
    });
  }
  const shots = cells.map((_, from) => {
    const line = new Int8Array(size).fill(-1);
    for (let d = 0; d < DIRECTIONS.length; d++) {
      let at = from;
      for (let n = 0; n < range; n++) {
        at = next[at]![d]!;
        if (at < 0) break;
        line[at] = d;
      }
    }
    return line;
  });
  return {
    key, cells, next, shots,
    distance: (from: Position, to: Position, team: Team): number => paths[team][key(to)]![key(from)]!,
    canMove: (from: Position, d: number, team: Team): boolean => {
      const to = next[key(from)]![d]!;
      return to >= 0 && to !== key(map.spawnPoints[otherTeam(team)]);
    },
  };
}

export type Geometry = ReturnType<typeof createGeometry>;
