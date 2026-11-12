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
  /** 生命值上限（重生時補滿到這個數） */
  maxHp: number;
  /** 每槍傷害 */
  shotDamage: number;
  /** 獲勝分數 */
  winningScore: number;
  /** 倒地後離場回合數 */
  knockedDownRounds: number;
  /** 重生後無敵回合數 */
  invulnerableRounds: number;
  /** 旗子重生等待回合數 */
  flagReturnRounds: number;
  /** 正規賽回合上限 */
  regularMaxRounds: number;
  /** 延長賽回合上限 */
  overtimeMaxRounds: number;
  /** 持旗者被打中（沒倒地也算）就掉旗（v0.3，做成開關方便比較） */
  dropFlagWhenHit: boolean;
  /**
   * 旗子出現位置的順序（v0.3）：開場用第 1 個，
   * 之後每得 1 分（不分哪一隊）換下一個，用完再從頭輪
   */
  flagSpawnOrder: Position[];
  /** 各隊重生點 */
  spawnPoints: Record<Team, Position>;
  /** 牆壁位置 */
  walls: Position[];
}

export const CTF_CONFIG: CtfConfig = {
  boardWidth: 9,
  boardHeight: 9,
  roundSeconds: 3,
  shootRange: 3,
  maxHp: 3,
  shotDamage: 1,
  winningScore: 3,
  knockedDownRounds: 2,
  invulnerableRounds: 2,
  flagReturnRounds: 2,
  regularMaxRounds: 200,
  overtimeMaxRounds: 50,
  dropFlagWhenHit: true,
  flagSpawnOrder: [
    { x: 4, y: 4 }, // 中央
    { x: 4, y: 2 }, // 上方
    { x: 4, y: 6 }, // 下方
  ],
  spawnPoints: {
    A: { x: 0, y: 4 },
    B: { x: 8, y: 4 },
  },
  walls: [
    { x: 2, y: 3 },
    { x: 2, y: 5 },
    { x: 6, y: 3 },
    { x: 6, y: 5 },
    { x: 4, y: 1 },
    { x: 4, y: 7 },
  ],
};
