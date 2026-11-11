// 奪旗遊戲用到的資料型別。

export type Team = 'A' | 'B';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Position {
  x: number;
  y: number;
}

/** 每個角色每回合只能選一個動作（規則第 4 節） */
export type Action =
  | { type: 'move'; direction: Direction }
  | { type: 'shoot'; direction: Direction }
  | { type: 'dropFlag' }
  | { type: 'stay' };

export interface Character {
  id: string;
  team: Team;
  /** 在場時的位置；倒地離場中為 null */
  position: Position | null;
  /** 目前生命值（倒地離場中為 0，重生時補滿） */
  hp: number;
  /** 離場中：還要再等幾回合才重生（在場時為 0） */
  respawnCountdown: number;
  /** 無敵還剩幾回合（0 表示沒有無敵） */
  invulnerableRoundsLeft: number;
}

/** 旗子的狀態：在地上、被拿著、或得分後等待回到中央 */
export type FlagState =
  | { status: 'onGround'; position: Position }
  | { status: 'carried'; carrierId: string }
  /** 得分後等待重新出現：還要等幾回合、下一次出現在哪一格（v0.3） */
  | { status: 'returning'; roundsLeft: number; nextPosition: Position };

/** 比賽進行到哪個階段：正規賽或延長賽（規則第 6 節） */
export type Phase = 'regular' | 'overtime';

/** 比賽是用哪一種方式結束的（規則第 6 節「其他」） */
export type ResultReason =
  | 'reachedWinningScore' // 拿到 3 分
  | 'higherScore' // 第 200 回合結算後分數較高
  | 'moreKnockdowns' // 分數相同，擊倒數較多
  | 'overtimeScore' // 延長賽得分
  | 'overtimeKnockdown' // 延長賽擊倒
  | 'draw'; // 延長賽回合上限到了，平手

export type GameResult =
  | { winner: Team; reason: Exclude<ResultReason, 'draw'> }
  | { winner: null; reason: 'draw' };

export interface GameState {
  /** 已經結算完的回合數（開場是 0；延長賽接著往上數，例如第 201 回合） */
  round: number;
  phase: Phase;
  scores: Record<Team, number>;
  /** 每隊打倒對方幾次（擊倒數） */
  knockdowns: Record<Team, number>;
  /** 用陣列存角色，之後 2v2、3v3 只要多放幾個角色 */
  characters: Character[];
  flag: FlagState;
  /** 比賽結束後才有值 */
  result: GameResult | null;
}

/** 每個角色這回合的動作，key 是角色 id；沒送出的角色視為「不動」 */
export type ActionMap = Record<string, Action | undefined>;

/** 這回合發生的事，給之後的畫面播動畫用 */
export type GameEvent =
  | { type: 'invalidAction'; characterId: string; action: unknown; reason: string }
  | { type: 'shot'; shooterId: string; direction: Direction; from: Position; hitId: string | null }
  | { type: 'shotBlockedByInvulnerable'; shooterId: string; targetId: string }
  | { type: 'damaged'; characterId: string; byId: string; damage: number; hpLeft: number }
  | { type: 'knockedDown'; characterId: string; byIds: string[]; position: Position }
  | { type: 'flagDropped'; characterId: string; position: Position; reason: FlagDropReason }
  | { type: 'moved'; characterId: string; from: Position; to: Position }
  | { type: 'moveBlocked'; characterId: string; from: Position; direction: Direction; reason: MoveBlockReason }
  | { type: 'flagPickedUp'; characterId: string; position: Position }
  | { type: 'scored'; characterId: string; team: Team; scores: Record<Team, number> }
  | { type: 'flagReturned'; position: Position }
  | { type: 'respawned'; characterId: string; position: Position; hp: number }
  | { type: 'overtimeStarted' }
  | { type: 'gameOver'; result: GameResult };

/** 旗子為什麼掉在地上：自己放下、被打中（v0.3）、倒地 */
export type FlagDropReason = 'dropped' | 'hit' | 'knockedDown';

export type MoveBlockReason =
  | 'wall'
  | 'outOfBounds'
  | 'enemySpawn'
  | 'sameTarget'
  | 'swap'
  | 'occupied';

export interface ResolveOutput {
  state: GameState;
  events: GameEvent[];
}

/** AI 腳本／真人玩家看到的場面：全部公開資訊，加上「我是誰」 */
export interface CharacterView {
  selfId: string;
  state: GameState;
}

/** AI 腳本的入口：輸入看到的場面，輸出一個動作 */
export type Bot = (view: CharacterView) => Action;
