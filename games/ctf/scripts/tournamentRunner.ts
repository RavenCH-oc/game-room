// 批次對打（docs/ctf-bots.md 第 6 節）：兩個 AI 用一串種子各打兩場（互換隊伍），統計勝負和花的時間。
// 指令（tournament.ts）和測試共用。
// 量時間只在這一層做：把 AI 包一層計時，遊戲核心和 AI 本身都不碰時間。
// 除了時間那一行，同樣的參數跑兩次，印出來的內容完全一樣。

import { CTF_CONFIG, type Bot, type CtfConfig, type GameState, type Team } from '../core/index.ts';
import { botLabel, createMatchBots, playGame } from './matchRunner.ts';

export interface TournamentOptions {
  botOne: string;
  botTwo: string;
  seedCount: number;
  startSeed: number;
  config?: CtfConfig;
  /** 量時間用的時鐘（毫秒）。預設 performance.now；測試可以換掉 */
  clock?: () => number;
}

/** 從 AI 一的角度看，這一場的結果 */
export type Outcome = 'win' | 'loss' | 'draw';

export interface TournamentMatch {
  seed: number;
  /** AI 一在哪一隊 */
  botOneTeam: Team;
  outcome: Outcome;
  final: GameState;
}

/** 一個 AI 每一步花的時間 */
export interface StepTiming {
  steps: number;
  totalMs: number;
  maxMs: number;
}

export interface TournamentResult {
  options: Required<Omit<TournamentOptions, 'clock'>>;
  /** 照打的順序：每個種子先打 AI 一在 A 隊的那場，再打 AI 一在 B 隊的那場 */
  matches: TournamentMatch[];
  timing: { botOne: StepTiming; botTwo: StepTiming };
}

/** 包一層計時：每呼叫一次 AI 就記下花了多久 */
function timed(bot: Bot, timing: StepTiming, clock: () => number): Bot {
  return (view) => {
    const start = clock();
    const action = bot(view);
    const spent = clock() - start;
    timing.steps += 1;
    timing.totalMs += spent;
    timing.maxMs = Math.max(timing.maxMs, spent);
    return action;
  };
}

export function runTournament(options: TournamentOptions): TournamentResult {
  const config = options.config ?? CTF_CONFIG;
  const clock = options.clock ?? (() => performance.now());
  const timing = {
    botOne: { steps: 0, totalMs: 0, maxMs: 0 },
    botTwo: { steps: 0, totalMs: 0, maxMs: 0 },
  };
  const matches: TournamentMatch[] = [];

  for (let index = 0; index < options.seedCount; index++) {
    const seed = options.startSeed + index;
    for (const botOneTeam of ['A', 'B'] as const) {
      // 每一場都重新建立 AI（每個角色一次）
      const [botA, botB] = botOneTeam === 'A' ? [options.botOne, options.botTwo] : [options.botTwo, options.botOne];
      const bots = createMatchBots(botA, botB, seed, config);
      const oneId = botOneTeam === 'A' ? 'A1' : 'B1';
      const twoId = botOneTeam === 'A' ? 'B1' : 'A1';
      const timedBots: Record<string, Bot> = {
        [oneId]: timed(bots[oneId]!, timing.botOne, clock),
        [twoId]: timed(bots[twoId]!, timing.botTwo, clock),
      };
      const final = playGame(timedBots, seed, config);
      const winner = final.result?.winner ?? null;
      const outcome: Outcome = winner === null ? 'draw' : winner === botOneTeam ? 'win' : 'loss';
      matches.push({ seed, botOneTeam, outcome, final });
    }
  }

  return {
    options: { botOne: options.botOne, botTwo: options.botTwo, seedCount: options.seedCount, startSeed: options.startSeed, config },
    matches,
    timing,
  };
}

/** 時間那一行的開頭（測試用來把這一行拿掉） */
export const TIMING_LINE_PREFIX = '每一步花的時間';

/** 把批次對打的結果整理成要印的每一行 */
export function formatTournament(result: TournamentResult): string[] {
  const { botOne, botTwo, seedCount, startSeed, config } = result.options;
  const matches = result.matches;
  const total = matches.length;
  const one = botLabel(botOne);
  const two = botLabel(botTwo);

  const count = (list: TournamentMatch[], outcome: Outcome): number => list.filter((match) => match.outcome === outcome).length;
  const record = (list: TournamentMatch[]): string =>
    `勝 ${count(list, 'win')}、負 ${count(list, 'loss')}、平手 ${count(list, 'draw')}（${list.length} 場）`;
  const percent = (part: number, whole: number): string => (whole === 0 ? '0.0' : ((part / whole) * 100).toFixed(1));
  const average = (values: number[]): string =>
    values.length === 0 ? '0.00' : (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
  const otherTeamOf = (team: Team): Team => (team === 'A' ? 'B' : 'A');

  const asA = matches.filter((match) => match.botOneTeam === 'A');
  const asB = matches.filter((match) => match.botOneTeam === 'B');
  const wins = count(matches, 'win');
  const longGames = matches.filter((match) => match.final.round >= config.regularMaxRounds).length;
  const lost = matches.filter((match) => match.outcome === 'loss').slice(0, 10);
  const ms = (value: number): string => value.toFixed(3);
  const timingText = (timing: StepTiming): string =>
    `平均 ${ms(timing.steps === 0 ? 0 : timing.totalMs / timing.steps)} 毫秒、最久 ${ms(timing.maxMs)} 毫秒`;

  const lines = [
    `批次對打：AI 一 = ${one}，AI 二 = ${two}`,
    `種子 ${startSeed} 到 ${startSeed + seedCount - 1}（共 ${seedCount} 個），每個種子打兩場：AI 一在 A 隊一場、在 B 隊一場`,
    '',
    `總場數：${total}`,
    `AI 一：${record(matches)}，勝率 ${percent(wins, total)}%（平手不算贏）`,
    `  AI 一在 A 隊時：${record(asA)}`,
    `  AI 一在 B 隊時：${record(asB)}`,
    `平均回合數：${average(matches.map((match) => match.final.round))}`,
    `平均分數：AI 一 ${average(matches.map((match) => match.final.scores[match.botOneTeam]))}、` +
      `AI 二 ${average(matches.map((match) => match.final.scores[otherTeamOf(match.botOneTeam)]))}`,
    `平均擊倒數：AI 一 ${average(matches.map((match) => match.final.knockdowns[match.botOneTeam]))}、` +
      `AI 二 ${average(matches.map((match) => match.final.knockdowns[otherTeamOf(match.botOneTeam)]))}`,
    `打到第 ${config.regularMaxRounds} 回合（含）以後才結束：${longGames} 場`,
    `${TIMING_LINE_PREFIX}：AI 一 ${timingText(result.timing.botOne)}；AI 二 ${timingText(result.timing.botTwo)}`,
    '',
  ];

  if (lost.length === 0) {
    lines.push('AI 一沒有輸掉任何一場。');
  } else {
    lines.push(`AI 一輸掉的前 ${lost.length} 場（可以用後面的指令重看）：`);
    for (const match of lost) {
      const [botA, botB] = match.botOneTeam === 'A' ? [botOne, botTwo] : [botTwo, botOne];
      lines.push(`  種子 ${match.seed}，AI 一在 ${match.botOneTeam} 隊 → npm run ctf:match -- ${botA} ${botB} ${match.seed}`);
    }
  }
  return lines;
}
