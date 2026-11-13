// 種子亂數（規則第 5 節「種子與亂數」，v0.5）。
// 算法固定用 mulberry32：亂數狀態存在場面資料裡，每取一次就算出新的狀態。
// 不用 Math.random、不用時間，所以同一個種子一定得到同一串數字。

/** 最大的種子（32 位元不帶正負號整數的上限） */
export const MAX_SEED = 4294967295;

/** 種子是不是 0 到 4294967295 之間的整數 */
export function isValidSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_SEED;
}

/**
 * 取一次亂數：
 * 1. 亂數狀態加上 0x6D2B79F5（只留 32 位元、不帶正負號）
 * 2. 照 mulberry32 的算法，由新的狀態算出 0（含）到 1（不含）之間的數
 * 回傳這個數，以及新的亂數狀態（要寫回場面）。
 */
export function nextRandom(rngState: number): { value: number; rngState: number } {
  const nextState = (rngState + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rngState: nextState };
}

/** 從 n 個候選裡抽一個：取第「r × n 的整數部分」個（從 0 開始數） */
export function pickIndex(value: number, count: number): number {
  return Math.floor(value * count);
}

/**
 * 32 位元 FNV-1a 雜湊：把一段文字變成 0 到 4294967295 的整數（v0.6 搬到核心，和範例 AI 共用）。
 * 算法：從 2166136261 開始，每個字元先 XOR 字元碼，再乘以 16777619（只留 32 位元、不帶正負號）。
 */
export function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
