// 存在瀏覽器裡的資料：暱稱、回到房間用的通行碼。
// 瀏覽器可能禁止儲存（例如無痕模式），所以每次讀寫都包起來，失敗就當作沒有。

const NICKNAME_KEY = 'game-room:nickname';
const TOKEN_KEY = 'game-room:ctf-token';

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // 不能存也沒關係
  }
}

const local = (): Storage => window.localStorage;
const session = (): Storage => window.sessionStorage;

export function loadNickname(): string {
  return read(local, NICKNAME_KEY) ?? '';
}

export function saveNickname(nickname: string): void {
  write(local, NICKNAME_KEY, nickname);
}

/**
 * 通行碼同時存在兩個地方：
 * - 分頁自己的（sessionStorage）：重新整理時用，兩個分頁各自記得自己是哪一邊
 * - 整個瀏覽器共用的（localStorage）：把分頁關掉再打開時用
 */
export function loadToken(): { token: string; sameTab: boolean } | null {
  const own = read(session, TOKEN_KEY);
  if (own) return { token: own, sameTab: true };
  const shared = read(local, TOKEN_KEY);
  return shared ? { token: shared, sameTab: false } : null;
}

export function saveToken(token: string | null): void {
  write(session, TOKEN_KEY, token);
  write(local, TOKEN_KEY, token);
}

/** 只清掉這個分頁自己的通行碼（共用的那份留給原本的分頁） */
export function clearTabToken(): void {
  write(session, TOKEN_KEY, null);
}
