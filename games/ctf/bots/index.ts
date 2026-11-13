// 範例 AI 的對外入口：用名稱和比賽種子建立 AI（伺服器和對打指令共用）。

import { CTF_CONFIG, type Bot, type CtfConfig } from '../core/index.ts';
import { createAttacker } from './attacker.ts';
import { deriveAiSeed } from './botRandom.ts';
import { createFlagRunner } from './flagRunner.ts';
import { createRandomWalker } from './randomWalker.ts';

export type BotKind = 'random' | 'runner' | 'attacker';

export const BOT_KINDS: readonly BotKind[] = ['random', 'runner', 'attacker'];

export const BOT_NAMES: Record<BotKind, string> = {
  random: '隨機亂走',
  runner: '搶旗',
  attacker: '攻擊型',
};

export function isBotKind(value: string): value is BotKind {
  return (BOT_KINDS as readonly string[]).includes(value);
}

/**
 * 建立一個 AI。AI 種子由比賽種子和角色 id 算出（見 botRandom.ts 的 deriveAiSeed）。
 * 每一場比賽都要重新呼叫一次。
 */
export function createBot(kind: BotKind, matchSeed: number, characterId: string, config: CtfConfig = CTF_CONFIG): Bot {
  const aiSeed = deriveAiSeed(matchSeed, characterId);
  switch (kind) {
    case 'random':
      return createRandomWalker(aiSeed);
    case 'runner':
      return createFlagRunner(aiSeed, config);
    case 'attacker':
      return createAttacker(aiSeed, config);
  }
}

export { deriveAiSeed } from './botRandom.ts';
