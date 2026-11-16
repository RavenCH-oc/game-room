// 讓兩個 AI 對打一整場，在終端機印出每回合的場地、雙方生命值和擊倒數。
// 用法：
//   npm run ctf:match                          （預設：A 隊亂走 vs B 隊搶旗，種子 1）
//   npm run ctf:match -- attacker runner       （A 隊攻擊型 vs B 隊搶旗）
//   npm run ctf:match -- random attacker 42    （最後的數字是種子）
//   npm run ctf:match -- 42                    （只指定種子，AI 用預設）
// AI 代號來自 AI 登記表（games/ctf/bots/index.ts），登記了就能用。
// v0.5：種子同時決定旗子位置和兩邊 AI 的隨機行為；同樣的 AI 組合加同樣的種子，印出來的內容完全一樣。

import { parseMatchArgs } from './commandArgs.ts';
import { runMatch } from './matchRunner.ts';

const parsed = parseMatchArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(1);
}

console.log(runMatch(parsed.botA, parsed.botB, parsed.seed).lines.join('\n'));
