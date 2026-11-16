// 奪旗遊戲的所有可調數字（對應規則文件第 7 節）。
// 要調整數值時只改這個檔案。
// v0.6：重生點和牆壁不再是設定，改由第 2 節的算法決定，存在每一場的場面資料裡（GameState.map）。
// 這裡的寬、高和地圖生成參數只在「建立開場場面」時用一次。

export interface CtfConfig {
  /** 場地寬（v0.6：只在生成地圖時用） */
  boardWidth: number;
  /** 場地高（v0.6：只在生成地圖時用） */
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
  /** 隨機地圖的生成參數（v0.6，規則第 2 節「隨機地圖」） */
  map: MapGenerationConfig;
}

export interface BotChances {
  /** 攻擊型：改打「對手現在位置」的機率（其餘打「猜對手會走到的那一格」） */
  attackerAimAtCurrentChance: number;
  /** 攻擊型：這回合不考慮開槍的機率 */
  attackerSkipShootingChance: number;
  /** 搶旗：這回合不動的機率（拿著旗時不用） */
  flagRunnerStayChance: number;
}

export interface MapGenerationConfig {
  /** 左右鏡像 */
  mirror: boolean;
  /** 牆壁格數最少 */
  minWalls: number;
  /** 牆壁格數最多 */
  maxWalls: number;
  /** 一段牆最長幾格 */
  maxSegmentLength: number;
  /** 重生點淨空範圍（x、y 差距都不超過這個數的格子不能放牆） */
  spawnClearance: number;
  /** 中線至少幾格不是牆 */
  minOpenMidlineCells: number;
  /** 一張地圖最多試放幾次牆 */
  maxPlacementAttempts: number;
  /** 最多重抽幾張 */
  maxMapDraws: number;
}

export const CTF_CONFIG: CtfConfig = {
  boardWidth: 11,
  boardHeight: 11,
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
  map: {
    mirror: true,
    minWalls: 14,
    maxWalls: 18,
    maxSegmentLength: 3,
    spawnClearance: 2,
    minOpenMidlineCells: 7,
    maxPlacementAttempts: 200,
    maxMapDraws: 1000,
  },
};
