// 伺服器的可調數字（對應 docs/web-v1.md 第 8 節）。
// 要調整數值時只改這個檔案。

export interface ServerConfig {
  /** 連接埠（可用環境變數 PORT 改） */
  port: number;
  /** 兩邊到齊後，開始前倒數幾秒 */
  startCountdownSeconds: number;
  /**
   * 回合開始時只要有任何角色倒地離場中，這一回合改成幾秒（docs/web-v1.md 第 5 節）。
   * 平常的回合秒數讀遊戲設定檔 games/ctf/core/config.ts
   */
  roundSecondsWhenSomeoneDown: number;
  /** 斷線後等幾秒，沒回來就判對手獲勝 */
  disconnectGraceSeconds: number;
  /** 比賽結束後幾分鐘沒人按按鈕就刪除房間 */
  finishedRoomTtlMinutes: number;
  /** 同時存在的房間數上限 */
  maxRooms: number;
  /** 暱稱最少幾個字 */
  nicknameMinLength: number;
  /** 暱稱最多幾個字 */
  nicknameMaxLength: number;
}

export const SERVER_CONFIG: ServerConfig = {
  port: 3000,
  startCountdownSeconds: 3,
  roundSecondsWhenSomeoneDown: 1.5,
  disconnectGraceSeconds: 30,
  finishedRoomTtlMinutes: 5,
  maxRooms: 50,
  nicknameMinLength: 1,
  nicknameMaxLength: 12,
};

/** 房號用的字母：大寫英文，排除容易看錯的 I 和 O */
export const ROOM_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;
