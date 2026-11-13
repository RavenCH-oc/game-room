// 讓兩個範例 AI 對打一整場，在終端機印出每回合的場地、雙方生命值和擊倒數。
// 用法：
//   npm run ctf:match                          （預設：A 隊亂走 vs B 隊搶旗，種子 1）
//   npm run ctf:match -- attacker runner       （A 隊攻擊型 vs B 隊搶旗）
//   npm run ctf:match -- random attacker 42    （最後的數字是種子）
//   npm run ctf:match -- 42                    （只指定種子，AI 用預設）
// AI 名稱：random（亂走）、runner（搶旗）、attacker（攻擊型）
// v0.5：種子同時決定旗子位置和兩邊 AI 的隨機行為；同樣的 AI 組合加同樣的種子，印出來的內容完全一樣。

import { isBotKind } from '../bots/index.ts';
import { DEFAULT_SEED, isValidSeed } from '../core/index.ts';
import { runMatch } from './matchRunner.ts';

const args = process.argv.slice(2);
const seedText = args.find((arg) => /^\d+$/.test(arg));
const seed = seedText ? Number(seedText) : DEFAULT_SEED;
if (!isValidSeed(seed)) {
  console.error(`種子要是 0 到 4294967295 之間的整數，收到：${seedText}`);
  process.exit(1);
}
const names = args.filter((arg) => arg !== seedText);
const kindA = names[0] ?? 'random';
const kindB = names[1] ?? 'runner';
if (!isBotKind(kindA) || !isBotKind(kindB)) {
  console.error(`不認得的 AI 名稱：${[kindA, kindB].filter((kind) => !isBotKind(kind)).join('、')}`);
  console.error('可以用的名稱：random（亂走）、runner（搶旗）、attacker（攻擊型）');
  console.error('例：npm run ctf:match -- attacker runner');
  process.exit(1);
}

console.log(runMatch(kindA, kindB, seed).lines.join('\n'));
