// 奪旗遊戲的所有可調數字（對應規則文件第 7 節）。
// 要調整數值時只改這個檔案。

import type { Position, Team } from './types.ts';

export interface CtfConfig {
  /** 場地寬 */
  boardWidth: number;
  /** 場地高 */
  boardHeight: number;
  /** 回合秒數（核心不計時，留給之後的伺服器使用） */
  roundSeconds: number;
  /** 射擊距離（格） */
  shootRange: number;
  /** 獲勝分數 */
  winningScore: number;
  /** 淘汰後離場回合數 */
  eliminatedRounds: number;
  /** 重生後無敵回合數 */
  invulnerableRounds: number;
  /** 旗子重生等待回合數 */
  flagReturnRounds: number;
  /** 回合上限 */
  maxRounds: number;
  /** 各隊重生點 */
  spawnPoints: Record<Team, Position>;
  /** 旗子起點 */
  flagStart: Position;
  /** 牆壁位置 */
  walls: Position[];
}

export const CTF_CONFIG: CtfConfig = {
  boardWidth: 9,
  boardHeight: 9,
  roundSeconds: 3,
  shootRange: 2,
  winningScore: 3,
  eliminatedRounds: 2,
  invulnerableRounds: 2,
  flagReturnRounds: 2,
  maxRounds: 200,
  spawnPoints: {
    A: { x: 0, y: 4 },
    B: { x: 8, y: 4 },
  },
  flagStart: { x: 4, y: 4 },
  walls: [
    { x: 2, y: 3 },
    { x: 2, y: 5 },
    { x: 6, y: 3 },
    { x: 6, y: 5 },
    { x: 4, y: 1 },
    { x: 4, y: 7 },
  ],
};
