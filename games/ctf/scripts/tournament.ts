// 批次對打：量兩個 AI 誰比較強（docs/ctf-bots.md 第 6 節）。
// 用法：
//   npm run ctf:tournament -- <AI 一> <AI 二> [種子數] [起始種子]
//   例：npm run ctf:tournament -- attacker runner 200 1
// 種子數預設 200、起始種子預設 1。每個種子打兩場（互換隊伍），所以 200 個種子是 400 場。
// AI 代號來自 AI 登記表（games/ctf/bots/index.ts），登記了就能用。

import { parseTournamentArgs } from './commandArgs.ts';
import { formatTournament, runTournament } from './tournamentRunner.ts';

const parsed = parseTournamentArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.error);
  process.exit(1);
}

const result = runTournament(parsed);
console.log(formatTournament(result).join('\n'));
