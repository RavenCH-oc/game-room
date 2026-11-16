// 對打指令和批次對打指令的參數檢查（指令和測試共用）。
// AI 代號一律到 AI 登記表（games/ctf/bots/index.ts）查，不另外寫死一份清單。

import { describeBotChoices, isRegisteredBot } from '../bots/index.ts';
import { DEFAULT_SEED, isValidSeed, MAX_SEED } from '../core/index.ts';

type Parsed<T> = ({ ok: true } & T) | { ok: false; error: string };

function unknownBotError(ids: string[], example: string): string {
  return [
    `不認得的 AI 代號：${ids.join('、')}`,
    `可以用的代號：${describeBotChoices()}`,
    `例：${example}`,
  ].join('\n');
}

/**
 * npm run ctf:match -- [AI 一] [AI 二] [種子]
 * AI 沒給時用 random 和 runner（維持原本的預設），種子沒給用 1。
 */
export function parseMatchArgs(args: string[]): Parsed<{ botA: string; botB: string; seed: number }> {
  const seedText = args.find((arg) => /^\d+$/.test(arg));
  const seed = seedText ? Number(seedText) : DEFAULT_SEED;
  if (!isValidSeed(seed)) {
    return { ok: false, error: `種子要是 0 到 ${MAX_SEED} 之間的整數，收到：${seedText}` };
  }
  const names = args.filter((arg) => arg !== seedText);
  const botA = names[0] ?? 'random';
  const botB = names[1] ?? 'runner';
  const unknown = [botA, botB].filter((id) => !isRegisteredBot(id));
  if (unknown.length > 0) {
    return { ok: false, error: unknownBotError(unknown, 'npm run ctf:match -- attacker runner') };
  }
  return { ok: true, botA, botB, seed };
}

/** 批次對打的預設：種子數 200、起始種子 1（docs/ctf-bots.md 第 6 節） */
export const DEFAULT_TOURNAMENT_SEEDS = 200;
export const DEFAULT_TOURNAMENT_START_SEED = 1;

/**
 * npm run ctf:tournament -- <AI 一> <AI 二> [種子數] [起始種子]
 */
export function parseTournamentArgs(
  args: string[],
): Parsed<{ botOne: string; botTwo: string; seedCount: number; startSeed: number }> {
  const usage = '用法：npm run ctf:tournament -- <AI 一> <AI 二> [種子數] [起始種子]\n例：npm run ctf:tournament -- attacker runner 200 1';
  const [botOne, botTwo, countText, startText, ...extra] = args;
  if (!botOne || !botTwo || extra.length > 0) return { ok: false, error: usage };

  const unknown = [botOne, botTwo].filter((id) => !isRegisteredBot(id));
  if (unknown.length > 0) {
    return { ok: false, error: unknownBotError(unknown, 'npm run ctf:tournament -- attacker runner 200 1') };
  }

  if (countText !== undefined && !/^\d+$/.test(countText)) return { ok: false, error: `種子數要是正整數，收到：${countText}\n${usage}` };
  if (startText !== undefined && !/^\d+$/.test(startText)) return { ok: false, error: `起始種子要是整數，收到：${startText}\n${usage}` };
  const seedCount = countText === undefined ? DEFAULT_TOURNAMENT_SEEDS : Number(countText);
  const startSeed = startText === undefined ? DEFAULT_TOURNAMENT_START_SEED : Number(startText);
  if (seedCount < 1) return { ok: false, error: `種子數至少要 1，收到：${seedCount}` };
  if (!isValidSeed(startSeed) || !isValidSeed(startSeed + seedCount - 1)) {
    return { ok: false, error: `種子要在 0 到 ${MAX_SEED} 之間：起始種子 ${startSeed}、種子數 ${seedCount} 會超出範圍` };
  }
  return { ok: true, botOne, botTwo, seedCount, startSeed };
}
