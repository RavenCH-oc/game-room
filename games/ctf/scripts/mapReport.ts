// npm run ctf:map 要印的內容（指令和測試共用）。

import { CTF_CONFIG, flagCandidateCells, generateMap, type CtfConfig } from '../core/index.ts';
import { renderMap } from './renderBoard.ts';

export function describeMap(seed: number, config: CtfConfig = CTF_CONFIG): string[] {
  const { map } = generateMap(seed, config.boardWidth, config.boardHeight, config.map);
  return [
    `種子：${seed}（${map.width}×${map.height}，左右鏡像${config.map.mirror ? '開' : '關'}）`,
    '',
    renderMap(map),
    '',
    'A / B = 重生點   f = 旗子可能出現的格子   # = 牆壁',
    '',
    `牆壁格數：${map.walls.length}`,
    `旗子候選格數：${flagCandidateCells(map).length}`,
  ];
}
