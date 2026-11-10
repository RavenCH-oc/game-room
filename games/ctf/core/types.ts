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
  /** 在場時的位置；被淘汰離場中為 null */
  position: Position | null;
  /** 離場中：還要再等幾回合才重生（在場時為 0） */
  respawnCountdown: number;
  /** 無敵還剩幾回合（0 表示沒有無敵） */
  invulnerableRoundsLeft: number;
}

/** 旗子的狀態：在地上、被拿著、或得分後等待回到中央 */
export type FlagState =
  | { status: 'onGround'; position: Position }
  | { status: 'carried'; carrierId: string }
  | { status: 'returning'; roundsLeft: number };

export type GameResult = { winner: Team } | { winner: null; draw: true };

export interface GameState {
  /** 已經結算完的回合數（開場是 0） */
  round: number;
  scores: Record<Team, number>;
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
  | { type: 'eliminated'; characterId: string; byId: string; position: Position }
  | { type: 'flagDropped'; characterId: string; position: Position; reason: 'dropped' | 'eliminated' }
  | { type: 'moved'; characterId: string; from: Position; to: Position }
  | { type: 'moveBlocked'; characterId: string; from: Position; direction: Direction; reason: MoveBlockReason }
  | { type: 'flagPickedUp'; characterId: string; position: Position }
  | { type: 'scored'; characterId: string; team: Team; scores: Record<Team, number> }
  | { type: 'flagReturned'; position: Position }
  | { type: 'respawned'; characterId: string; position: Position }
  | { type: 'gameOver'; result: GameResult };

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
