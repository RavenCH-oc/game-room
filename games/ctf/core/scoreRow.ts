// 得分排（規則第 2 節「得分排」，v0.8）。
// 結算、AI、對打指令、網頁都用這裡的兩個函式，不各寫一份。得分格不存在場面資料裡，每次照地圖和設定算。

import { isWall, samePosition } from './board.ts';
import type { CtfConfig } from './config.ts';
import type { GameMap, Position, Team } from './types.ts';

/**
 * 這一格是不是這一隊的得分格：
 * - 「整排得分」開：和自己的重生點同一個直行（x 相同）、在場地裡、不是牆。重生點自己也是。
 * - 關掉：只有重生點那一格。
 */
export function isScoringCell(position: Position, team: Team, map: GameMap, config: CtfConfig): boolean {
  const spawn = map.spawnPoints[team];
  if (!config.wholeRowScoring) return samePosition(position, spawn);
  return (
    position.x === spawn.x &&
    position.y >= 0 &&
    position.y < map.height &&
    !isWall(position, map)
  );
}

/** 這一隊的得分格清單，照 y 由小到大 */
export function scoringCells(team: Team, map: GameMap, config: CtfConfig): Position[] {
  const spawn = map.spawnPoints[team];
  if (!config.wholeRowScoring) return [{ ...spawn }];
  const cells: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    const cell = { x: spawn.x, y };
    if (isScoringCell(cell, team, map, config)) cells.push(cell);
  }
  return cells;
}
