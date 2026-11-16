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

/**
 * 旗子的狀態（v0.5：規則第 5 節「旗子的三個階段」）
 * - hidden 隱藏：場上沒有旗子，也還沒決定下一個位置
 * - announced 預告：已經公布下一個位置，但旗子還不在場上、不能撿
 * - onGround 在地上：可以撿
 * - carried 被拿著
 */
export type FlagState =
  | { status: 'hidden'; roundsLeft: number }
  | { status: 'announced'; roundsLeft: number; nextPosition: Position }
  | { status: 'onGround'; position: Position }
  | { status: 'carried'; carrierId: string };

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

/**
 * 一場比賽的地圖（v0.6，規則第 2 節「地圖放在場面資料裡」）。
 * 建立開場場面時決定，整場比賽不變；是公開資訊。
 */
export interface GameMap {
  width: number;
  height: number;
  /** 兩隊的重生點 */
  spawnPoints: Record<Team, Position>;
  /** 牆壁清單，照「y 由小到大，y 相同時 x 由小到大」排列 */
  walls: Position[];
}

/**
 * 公開的場面：給 AI 腳本看、送給瀏覽器的都是這個（v0.5：不含種子和亂數狀態；v0.6：包含地圖）。
 */
export interface PublicGameState {
  /** 這一場的地圖（v0.6） */
  map: GameMap;
  /** 已經結算完的回合數（開場是 0；延長賽接著往上數，例如第 201 回合） */
  round: number;
  phase: Phase;
  scores: Record<Team, number>;
  /** 每隊打倒對方幾次（擊倒數） */
  knockdowns: Record<Team, number>;
  /** 用陣列存角色，之後 2v2、3v3 只要多放幾個角色 */
  characters: Character[];
  flag: FlagState;
  /**
   * 上一面旗子「出現時」的那一格（v0.5）。抽下一面旗子的位置時要去掉這一格。
   * 開局還沒出現過旗子時是 null。
   */
  lastFlagSpawn: Position | null;
  /** 比賽結束後才有值 */
  result: GameResult | null;
}

/** 完整的場面：公開的部分，加上不公開的種子和亂數狀態（v0.5） */
export interface GameState extends PublicGameState {
  /** 這場比賽的種子（0 到 4294967295）。比賽結束後才可以公開 */
  seed: number;
  /** 目前的亂數狀態（mulberry32）。初始值就是種子 */
  rngState: number;
}

/** 每個角色這回合的動作，key 是角色 id；沒送出的角色視為「不動」 */
export type ActionMap = Record<string, Action | undefined>;

/** 這回合發生的事，給之後的畫面播動畫用 */
export type GameEvent =
  | { type: 'invalidAction'; characterId: string; action: unknown; reason: string }
  | {
      type: 'shot';
      shooterId: string;
      direction: Direction;
      from: Position;
      /** 子彈停下的格子（打到人就是那人的格子；沒打到是射程盡頭或牆前） */
      endPosition: Position;
      hitId: string | null;
      /** v0.4：回合開始時站在這條射擊線上、但移動後沒被打到的人（閃掉了） */
      dodgedId: string | null;
      /** v0.4：被打到的人回合開始時不在這條線上的第一個位置（走進射擊線） */
      movedIntoLine: boolean;
    }
  | { type: 'shotBlockedByInvulnerable'; shooterId: string; targetId: string }
  | { type: 'damaged'; characterId: string; byId: string; damage: number; hpLeft: number }
  | { type: 'knockedDown'; characterId: string; byIds: string[]; position: Position }
  | { type: 'flagDropped'; characterId: string; position: Position; reason: FlagDropReason }
  | { type: 'moved'; characterId: string; from: Position; to: Position }
  | { type: 'moveBlocked'; characterId: string; from: Position; direction: Direction; reason: MoveBlockReason }
  | { type: 'flagPickedUp'; characterId: string; position: Position }
  | { type: 'scored'; characterId: string; team: Team; scores: Record<Team, number> }
  /** v0.5：旗子進入預告階段，公布下一個位置 */
  | { type: 'flagAnnounced'; position: Position; roundsLeft: number }
  /** v0.5：旗子出現在地上 */
  | { type: 'flagAppeared'; position: Position }
  /** v0.5：「得分後重新開局」開關打開時，得分那一回合所有角色回到重生點、生命補滿 */
  | { type: 'resetAfterScore' }
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

/** AI 腳本／真人玩家看到的場面：全部公開資訊（不含種子和亂數狀態），加上「我是誰」 */
export interface CharacterView {
  selfId: string;
  state: PublicGameState;
}

/** AI 腳本的入口：輸入看到的場面，輸出一個動作 */
export type Bot = (view: CharacterView) => Action;
