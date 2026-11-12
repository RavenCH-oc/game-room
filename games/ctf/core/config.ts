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
  /** 旗子「隱藏」階段的回合數（v0.5）。0 表示跳過隱藏，直接抽位置進入預告 */
  flagHiddenRounds: number;
  /** 旗子「預告」階段的回合數（v0.5）。0 表示跳過預告，隱藏結束就直接出現 */
  flagAnnounceRounds: number;
  /** 正規賽回合上限 */
  regularMaxRounds: number;
  /** 延長賽回合上限 */
  overtimeMaxRounds: number;
  /** 持旗者被打中（沒倒地也算）就掉旗（v0.3，做成開關方便比較） */
  dropFlagWhenHit: boolean;
  /** 得分後重新開局（v0.5，開關）：有人得分的那一回合，射擊結算完所有角色回到重生點、生命補滿 */
  resetOnScore: boolean;
  /** 範例 AI 的機率（v0.5，規則第 7、8 節），0 到 1 */
  bots: BotChances;
  /** 各隊重生點 */
  spawnPoints: Record<Team, Position>;
  /** 牆壁位置 */
  walls: Position[];
}

export interface BotChances {
  /** 攻擊型：改打「對手現在位置」的機率（其餘打「猜對手會走到的那一格」） */
  attackerAimAtCurrentChance: number;
  /** 攻擊型：這回合不考慮開槍的機率 */
  attackerSkipShootingChance: number;
  /** 搶旗：這回合不動的機率（拿著旗時不用） */
  flagRunnerStayChance: number;
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
  flagHiddenRounds: 2,
  flagAnnounceRounds: 2,
  regularMaxRounds: 200,
  overtimeMaxRounds: 50,
  dropFlagWhenHit: true,
  resetOnScore: false,
  bots: {
    attackerAimAtCurrentChance: 0.25,
    attackerSkipShootingChance: 0.15,
    flagRunnerStayChance: 0.1,
  },
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
