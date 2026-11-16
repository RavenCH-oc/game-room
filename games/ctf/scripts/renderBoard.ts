// 把場面畫成規則第 2 節那種文字圖，給終端機看。
// v0.6：寬高、重生點、牆壁照場面裡的地圖；座標有兩位數，每一欄都佔 3 個字元寬，才會對齊。

import { flagCandidateCells, samePosition, type GameMap, type Position, type PublicGameState } from '../core/index.ts';

/** 每一欄的寬度（字元數） */
const COLUMN_WIDTH = 3;

/**
 * 對打用的場地圖。符號：
 *   A / B = 重生點   F = 旗子（在地上）   # = 牆壁
 *   a / b = A 隊 / B 隊的角色   @ = 正在拿旗的角色（場地下方會寫是誰）
 */
export function renderBoard(state: PublicGameState): string {
  return renderGrid(state.map, (position) => symbolAt(state, position));
}

/**
 * 只畫地圖（npm run ctf:map 用）。符號：A / B = 重生點   f = 旗子可能出現的格子   # = 牆壁
 */
export function renderMap(map: GameMap): string {
  const candidates = flagCandidateCells(map);
  return renderGrid(map, (position) => {
    const terrain = terrainAt(map, position);
    if (terrain !== '.') return terrain;
    return candidates.some((cell) => samePosition(cell, position)) ? 'f' : '.';
  });
}

function renderGrid(map: GameMap, symbol: (position: Position) => string): string {
  const rowLabelWidth = String(map.height - 1).length;
  const header =
    ' '.repeat(rowLabelWidth + 1) +
    Array.from({ length: map.width }, (_, x) => String(x).padStart(COLUMN_WIDTH)).join('');
  const lines = [header];
  for (let y = 0; y < map.height; y++) {
    let line = String(y).padStart(rowLabelWidth) + ' ';
    for (let x = 0; x < map.width; x++) {
      line += symbol({ x, y }).padStart(COLUMN_WIDTH);
    }
    lines.push(line);
  }
  return lines.join('\n');
}

function terrainAt(map: GameMap, position: Position): string {
  if (map.walls.some((wall) => samePosition(wall, position))) return '#';
  if (samePosition(map.spawnPoints.A, position)) return 'A';
  if (samePosition(map.spawnPoints.B, position)) return 'B';
  return '.';
}

function symbolAt(state: PublicGameState, position: Position): string {
  const character = state.characters.find(
    (candidate) => candidate.position && samePosition(candidate.position, position),
  );
  if (character) {
    const isCarrier = state.flag.status === 'carried' && state.flag.carrierId === character.id;
    if (isCarrier) return '@';
    return character.team === 'A' ? 'a' : 'b';
  }
  if (state.flag.status === 'onGround' && samePosition(state.flag.position, position)) return 'F';
  return terrainAt(state.map, position);
}
