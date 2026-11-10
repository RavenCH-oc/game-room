// 把場面畫成規則第 2 節那種文字圖，給終端機看。

import { CTF_CONFIG, samePosition, type CtfConfig, type GameState, type Position } from '../core/index.ts';

/**
 * 符號：
 *   A / B = 重生點   F = 旗子（在地上）   # = 牆壁
 *   a / b = A 隊 / B 隊的角色   @ = 正在拿旗的角色（場地下方會寫是誰）
 */
export function renderBoard(state: GameState, config: CtfConfig = CTF_CONFIG): string {
  const header = '   ' + Array.from({ length: config.boardWidth }, (_, x) => String(x)).join(' ');
  const lines = [header];

  for (let y = 0; y < config.boardHeight; y++) {
    const cells: string[] = [];
    for (let x = 0; x < config.boardWidth; x++) {
      cells.push(symbolAt(state, { x, y }, config));
    }
    lines.push(`${y}  ${cells.join(' ')}`);
  }
  return lines.join('\n');
}

function symbolAt(state: GameState, position: Position, config: CtfConfig): string {
  const character = state.characters.find(
    (candidate) => candidate.position && samePosition(candidate.position, position),
  );
  if (character) {
    const isCarrier = state.flag.status === 'carried' && state.flag.carrierId === character.id;
    if (isCarrier) return '@';
    return character.team === 'A' ? 'a' : 'b';
  }
  if (state.flag.status === 'onGround' && samePosition(state.flag.position, position)) return 'F';
  if (config.walls.some((wall) => samePosition(wall, position))) return '#';
  if (samePosition(config.spawnPoints.A, position)) return 'A';
  if (samePosition(config.spawnPoints.B, position)) return 'B';
  return '.';
}
