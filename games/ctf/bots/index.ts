// AI 登記表（docs/ctf-bots.md 第 5 節）。
// 對打指令（ctf:match）、批次對打（ctf:tournament）、伺服器的對手清單、網頁開房的對手選單
// 都從這份登記表來，不另外寫死一份 AI 清單。
//
// 要加新的 AI：在下面的 BOT_REGISTRY 加一筆（代號、顯示名稱、建立函式），不用改別的地方。

import { CTF_CONFIG, type Bot, type CtfConfig } from '../core/index.ts';
import { createAttacker } from './attacker.ts';
import { deriveAiSeed } from './botRandom.ts';
import { createFlagRunner } from './flagRunner.ts';
import { createRandomWalker } from './randomWalker.ts';
import { createCodex } from './codex/index.ts';

/** 建立 AI 時拿到的東西（docs/ctf-bots.md 第 1 節） */
export interface BotContext {
  /** AI 種子：由比賽種子和角色 id 算出（botRandom.ts 的 deriveAiSeed） */
  aiSeed: number;
  /** 這個 AI 控制的角色 id */
  characterId: string;
  /** 遊戲設定 */
  config: CtfConfig;
}

/** 登記表裡的一筆 AI */
export interface BotEntry {
  /** 代號：英文小寫，指令用（例如 attacker） */
  id: string;
  /** 顯示名稱（網頁選單顯示「AI：」加上這個名稱） */
  name: string;
  /**
   * 建立函式：每一場比賽、每個由這個 AI 控制的角色，各呼叫一次。
   * 回傳的函式每回合呼叫一次。新的 AI 可以把「這一場」要記的東西放在建立函式裡的變數，
   * 這一場結束就丟掉（範例 AI 不記東西，那是範例 AI 自己的規定）。
   */
  create: (context: BotContext) => Bot;
}

/** 登記表：照這個順序出現在網頁的對手選單 */
const BOT_REGISTRY: BotEntry[] = [
  { id: 'attacker', name: '攻擊', create: ({ aiSeed, config }) => createAttacker(aiSeed, config) },
  { id: 'runner', name: '搶旗', create: ({ aiSeed, config }) => createFlagRunner(aiSeed, config) },
  { id: 'random', name: '亂走', create: ({ aiSeed }) => createRandomWalker(aiSeed) },
  { id: 'codex', name: 'Codex', create: ({ aiSeed, config }) => createCodex(aiSeed, config) },
];

/** 代號的格式：英文小寫開頭，後面可以接英文小寫或數字 */
const BOT_ID_PATTERN = /^[a-z][a-z0-9]*$/;

/** 登記表裡所有的 AI（照登記的順序，回傳複本） */
export function listBots(): BotEntry[] {
  return [...BOT_REGISTRY];
}

/** 用代號找 AI；找不到回傳 undefined */
export function findBot(id: string): BotEntry | undefined {
  return BOT_REGISTRY.find((entry) => entry.id === id);
}

export function isRegisteredBot(id: string): boolean {
  return findBot(id) !== undefined;
}

/**
 * 臨時多登記一個 AI（給測試用）。回傳一個函式，呼叫它就把這筆移除。
 * 正式的 AI 請直接寫在上面的 BOT_REGISTRY。
 */
export function registerBot(entry: BotEntry): () => void {
  if (!BOT_ID_PATTERN.test(entry.id)) {
    throw new Error(`AI 代號要是英文小寫（可以接數字），收到：${entry.id}`);
  }
  if (findBot(entry.id)) throw new Error(`AI 代號 ${entry.id} 已經登記過了`);
  BOT_REGISTRY.push(entry);
  return () => {
    const index = BOT_REGISTRY.indexOf(entry);
    if (index >= 0) BOT_REGISTRY.splice(index, 1);
  };
}

/**
 * 建立一個 AI：AI 種子由比賽種子和角色 id 算出（deriveAiSeed）。
 * 每一場比賽、每個角色都要重新呼叫一次。代號沒登記過會報錯。
 */
export function createBot(id: string, matchSeed: number, characterId: string, config: CtfConfig = CTF_CONFIG): Bot {
  const entry = findBot(id);
  if (!entry) throw new Error(`沒有登記代號 ${id} 的 AI`);
  return entry.create({ aiSeed: deriveAiSeed(matchSeed, characterId), characterId, config });
}

/** 指令印出錯誤訊息時用：「attacker（攻擊）、runner（搶旗）…」 */
export function describeBotChoices(): string {
  return BOT_REGISTRY.map((entry) => `${entry.id}（${entry.name}）`).join('、');
}

export { deriveAiSeed } from './botRandom.ts';
