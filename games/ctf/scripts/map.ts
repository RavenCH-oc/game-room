// 印出某個種子的地圖（規則第 8 節，v0.6）。
// 用法：
//   npm run ctf:map          （種子 1）
//   npm run ctf:map -- 42    （種子 42）
// 印出第 2 節那種文字圖（含 f 記號）、牆壁格數、旗子候選格數。

import { DEFAULT_SEED, isValidSeed } from '../core/index.ts';
import { describeMap } from './mapReport.ts';

const seedText = process.argv.slice(2).find((arg) => /^\d+$/.test(arg));
const seed = seedText ? Number(seedText) : DEFAULT_SEED;
if (!isValidSeed(seed)) {
  console.error(`種子要是 0 到 4294967295 之間的整數，收到：${seedText}`);
  process.exit(1);
}

console.log(describeMap(seed).join('\n'));
