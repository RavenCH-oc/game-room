// 瀏覽器和伺服器之間傳的訊息格式。網頁那邊只引用這裡的型別。

import type { Action, GameEvent, GameResult, PublicGameState, Team } from '../games/ctf/core/index.ts';

/**
 * 開房時選的對手：等朋友，或 AI 登記表（games/ctf/bots/index.ts）裡的某個 AI（用代號指定）。
 * 伺服器和網頁都不另外寫死 AI 清單（docs/web-v1.md 第 3 節）。
 */
export type OpponentChoice = { kind: 'friend' } | { kind: 'ai'; botId: string };

/** 網頁開房選單用的 AI 清單（照登記表的順序） */
export interface BotListItem {
  /** 代號，開房時送回伺服器 */
  id: string;
  /** 顯示名稱；選單顯示「AI：」加上這個名稱 */
  name: string;
}

/** 瀏覽器 → 伺服器 */
export type ClientMessage =
  | { type: 'createRoom'; nickname: string; opponent: OpponentChoice }
  | { type: 'joinRoom'; nickname: string; roomCode: string }
  /**
   * 重新整理後，用之前拿到的通行碼回到原本的房間。
   * sameTab：通行碼是不是這個分頁自己存的。是的話（重新整理），可以接手還沒斷乾淨的舊連線；
   * 不是的話（例如另一個分頁讀到共用的通行碼），位子上有人連線中就不能搶。
   */
  | { type: 'resume'; token: string; sameTab: boolean }
  /** round 是「這個動作要給第幾回合」，避免上一回合的動作晚到被算進下一回合 */
  | { type: 'action'; round: number; action: Action }
  | { type: 'rematch' }
  | { type: 'leaveRoom' };

/** 房間的階段（docs/web-v1.md 第 4 節） */
export type RoomPhase = 'waiting' | 'countdown' | 'playing' | 'finished';

/** 伺服器層的結束方式：遊戲核心的六種，再加上「對手離開」（第 7 節） */
export type MatchResult = GameResult | { winner: Team; reason: 'opponentLeft' };

export interface SeatView {
  nickname: string;
  isAi: boolean;
  connected: boolean;
  /** 比賽結束後按了「再來一場」 */
  wantsRematch: boolean;
  /** 比賽結束後按了「回大廳」 */
  left: boolean;
}

/**
 * 某一位玩家看到的房間。
 * 注意：這裡只有「自己」選的動作，對手只會有「已經選好了沒」。
 */
export interface RoomView {
  roomCode: string;
  phase: RoomPhase;
  opponent: OpponentChoice;
  yourTeam: Team;
  yourCharacterId: string;
  seats: Record<Team, SeatView | null>;
  /** 開始前倒數還剩幾毫秒（倒數階段才有） */
  countdownRemainingMs: number | null;
  /** 這回合還剩幾毫秒（比賽中才有） */
  roundRemainingMs: number | null;
  /** 這回合實際的總長度（毫秒）：平常 3000，有人倒地時 1500。倒數條照它畫（比賽中才有） */
  roundTotalMs: number | null;
  /** 遊戲場面（倒數、比賽中、結束後才有）。v0.5：不含種子和亂數狀態 */
  game: PublicGameState | null;
  /** 這一場的種子（v0.5）：比賽結束後才有，進行中一律是 null */
  seed: number | null;
  /** 自己這回合目前選的動作 */
  yourAction: Action | null;
  /** 對手這回合是否已經選好（不會告訴你他選了什麼） */
  opponentReady: boolean;
  result: MatchResult | null;
}

/** 伺服器 → 瀏覽器 */
export type ServerMessage =
  | { type: 'error'; message: string }
  /** 連線一建立就送一次：開房選單用的 AI 清單（來自 AI 登記表） */
  | { type: 'botList'; bots: BotListItem[] }
  /** 進入房間（開房、加入、重連成功）時送一次，裡面的通行碼請存起來 */
  | { type: 'joined'; token: string; roomCode: string; team: Team }
  /** 重連失敗：gone = 房間不在了或通行碼不對；inUse = 那個位子正在被另一個分頁使用 */
  | { type: 'resumeFailed'; reason: 'gone' | 'inUse'; message: string }
  /** 房間有任何變化就送一次最新狀態；events 只在剛結算完一回合時才有 */
  | { type: 'room'; room: RoomView; events?: GameEvent[] }
  /** 房間被刪除或自己離開房間 */
  | { type: 'leftRoom'; message: string | null };
