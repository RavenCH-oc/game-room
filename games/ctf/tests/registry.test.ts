// AI 登記表（docs/ctf-bots.md 第 5 節）和批次對打（第 6 節）的測試。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBot, findBot, listBots, registerBot, type BotEntry } from '../bots/index.ts';
import { parseMatchArgs, parseTournamentArgs } from '../scripts/commandArgs.ts';
import { playMatch, runMatch } from '../scripts/matchRunner.ts';
import { formatTournament, runTournament, TIMING_LINE_PREFIX } from '../scripts/tournamentRunner.ts';
import { CTF_CONFIG, createInitialState, getCharacterView, type Action } from '../core/index.ts';

/**
 * 測試用的 AI：會「在同一場比賽裡記東西」——記住自己被呼叫了幾次。
 * 第奇數次往右走、第偶數次不動。每次建立都記在 created 裡。
 */
const created: { characterId: string; aiSeed: number }[] = [];
const MEMORY_BOT: BotEntry = {
  id: 'memorytest',
  name: '記憶測試',
  create: ({ aiSeed, characterId }) => {
    created.push({ characterId, aiSeed });
    let calls = 0; // 這一場的記憶：建立時產生，這一場結束就丟掉
    return (): Action => {
      calls += 1;
      return calls % 2 === 1 ? { type: 'move', direction: 'right' } : { type: 'stay' };
    };
  },
};

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
  created.length = 0;
});

describe('docs/ctf-bots.md 第 5 節：AI 登記表', () => {
  it('三個範例 AI 都在登記表裡，代號 attacker、runner、random，照網頁選單的順序', () => {
    expect(listBots().map((entry) => [entry.id, entry.name])).toEqual([
      ['attacker', '攻擊'],
      ['runner', '搶旗'],
      ['random', '亂走'],
    ]);
  });

  it('用代號建立 AI；代號沒登記過會報錯', () => {
    const state = createInitialState(CTF_CONFIG, 1);
    const bot = createBot('runner', 1, 'A1');
    expect(bot(getCharacterView(state, 'A1')).type).toBeDefined();
    expect(() => createBot('nobody', 1, 'A1')).toThrow(/沒有登記代號 nobody/);
  });

  it('臨時多登記一個 AI：登記表裡有它，移除後就沒有了', () => {
    unregister = registerBot(MEMORY_BOT);
    expect(listBots().map((entry) => entry.id)).toEqual(['attacker', 'runner', 'random', 'memorytest']);
    expect(findBot('memorytest')).toBe(MEMORY_BOT);
    unregister();
    unregister = null;
    expect(findBot('memorytest')).toBeUndefined();
  });

  it('代號重複或不是英文小寫時不能登記', () => {
    expect(() => registerBot({ ...MEMORY_BOT, id: 'attacker' })).toThrow(/已經登記過/);
    expect(() => registerBot({ ...MEMORY_BOT, id: 'Memory' })).toThrow(/英文小寫/);
    expect(() => registerBot({ ...MEMORY_BOT, id: '' })).toThrow(/英文小寫/);
  });

  it('新 AI 的建立函式每場、每個角色呼叫一次，可以在同一場比賽裡記東西', () => {
    unregister = registerBot(MEMORY_BOT);
    const state = createInitialState(CTF_CONFIG, 3);
    const view = getCharacterView(state, 'A1');

    const first = createBot('memorytest', 3, 'A1');
    expect([first(view), first(view), first(view)]).toEqual([
      { type: 'move', direction: 'right' },
      { type: 'stay' },
      { type: 'move', direction: 'right' },
    ]);
    // 新的一場重新建立：記憶從頭開始，不會帶到下一場
    const second = createBot('memorytest', 3, 'A1');
    expect(second(view)).toEqual({ type: 'move', direction: 'right' });

    // 打一整場：兩個角色各建立一次，拿到各自的 AI 種子
    created.length = 0;
    playMatch('memorytest', 'memorytest', 5);
    expect(created.map((entry) => entry.characterId)).toEqual(['A1', 'B1']);
    expect(created[0]!.aiSeed).not.toBe(created[1]!.aiSeed);
  });

  it('ctf:match 認得臨時登記的 AI', () => {
    expect(parseMatchArgs(['memorytest', 'runner', '3'])).toMatchObject({ ok: false });
    unregister = registerBot(MEMORY_BOT);
    expect(parseMatchArgs(['memorytest', 'runner', '3'])).toEqual({ ok: true, botA: 'memorytest', botB: 'runner', seed: 3 });
    const output = runMatch('memorytest', 'runner', 3);
    expect(output.lines[1]).toBe('A 隊：記憶測試（memorytest）  vs  B 隊：搶旗（runner）');
    expect(output.finalState.result).not.toBeNull();
  });

  it('ctf:match 的參數：沒給 AI 用 random 和 runner、沒給種子用 1；代號打錯時列出登記表裡的代號', () => {
    expect(parseMatchArgs([])).toEqual({ ok: true, botA: 'random', botB: 'runner', seed: 1 });
    const wrong = parseMatchArgs(['attack', 'runner']);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error).toContain('attacker（攻擊）、runner（搶旗）、random（亂走）');
  });
});

describe('docs/ctf-bots.md 第 6 節：批次對打', () => {
  /** 把時間那一行拿掉，剩下的要完全一樣 */
  const withoutTiming = (lines: string[]): string[] => lines.filter((line) => !line.startsWith(TIMING_LINE_PREFIX));

  it('參數：種子數預設 200、起始種子預設 1；不合理的參數會說明用法', () => {
    expect(parseTournamentArgs(['attacker', 'runner'])).toEqual({
      ok: true,
      botOne: 'attacker',
      botTwo: 'runner',
      seedCount: 200,
      startSeed: 1,
    });
    expect(parseTournamentArgs(['attacker', 'runner', '50', '7'])).toMatchObject({ ok: true, seedCount: 50, startSeed: 7 });
    for (const bad of [[], ['attacker'], ['attacker', 'nobody'], ['attacker', 'runner', '0'], ['attacker', 'runner', 'x'], ['attacker', 'runner', '1', '4294967296']]) {
      expect(parseTournamentArgs(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('同樣的參數跑兩次，除了時間那一行以外輸出完全一樣', () => {
    const run = () => formatTournament(runTournament({ botOne: 'attacker', botTwo: 'runner', seedCount: 10, startSeed: 1 }));
    const first = run();
    const second = run();
    expect(first.filter((line) => line.startsWith(TIMING_LINE_PREFIX))).toHaveLength(1);
    expect(withoutTiming(second)).toEqual(withoutTiming(first));
  });

  it('每個種子確實打兩場、互換隊伍；勝負平手加起來等於總場數', () => {
    const result = runTournament({ botOne: 'attacker', botTwo: 'attacker', seedCount: 8, startSeed: 21 });
    expect(result.matches).toHaveLength(16);
    for (let seed = 21; seed <= 28; seed++) {
      const ofSeed = result.matches.filter((match) => match.seed === seed);
      expect(ofSeed.map((match) => match.botOneTeam)).toEqual(['A', 'B']);
    }
    const tally = (outcome: string) => result.matches.filter((match) => match.outcome === outcome).length;
    expect(tally('win') + tally('loss') + tally('draw')).toBe(16);

    const lines = formatTournament(result);
    expect(lines).toContain('總場數：16');
    const record = lines.find((line) => line.startsWith('AI 一：'))!;
    const [wins, losses, draws] = [...record.matchAll(/(?:勝|負|平手) (\d+)/g)].map((match) => Number(match[1]));
    expect(wins! + losses! + draws!).toBe(16);
  });

  it('每一場的結果和單獨用 ctf:match 打同一場一樣（AI 一在 B 隊的那場是 AI 二對 AI 一）', () => {
    const result = runTournament({ botOne: 'attacker', botTwo: 'runner', seedCount: 3, startSeed: 1 });
    for (const match of result.matches) {
      const [botA, botB] = match.botOneTeam === 'A' ? ['attacker', 'runner'] : ['runner', 'attacker'];
      expect(match.final).toEqual(playMatch(botA, botB, match.seed));
    }
  });

  it('印出 docs/ctf-bots.md 第 6 節列的每一項', () => {
    // 時間用假的時鐘：每問一次加 0.5 毫秒，所以每一步剛好 0.5 毫秒
    let now = 0;
    const clock = () => (now += 0.5);
    const result = runTournament({ botOne: 'runner', botTwo: 'attacker', seedCount: 5, startSeed: 1, clock });
    const text = formatTournament(result).join('\n');
    expect(text).toContain('總場數：10');
    expect(text).toMatch(/AI 一：勝 \d+、負 \d+、平手 \d+（10 場），勝率 \d+\.\d%（平手不算贏）/);
    expect(text).toMatch(/AI 一在 A 隊時：勝 \d+、負 \d+、平手 \d+（5 場）/);
    expect(text).toMatch(/AI 一在 B 隊時：勝 \d+、負 \d+、平手 \d+（5 場）/);
    expect(text).toMatch(/平均回合數：\d+\.\d\d/);
    expect(text).toMatch(/平均分數：AI 一 \d+\.\d\d、AI 二 \d+\.\d\d/);
    expect(text).toMatch(/平均擊倒數：AI 一 \d+\.\d\d、AI 二 \d+\.\d\d/);
    expect(text).toMatch(/打到第 200 回合（含）以後才結束：\d+ 場/);
    expect(text).toContain('每一步花的時間：AI 一 平均 0.500 毫秒、最久 0.500 毫秒；AI 二 平均 0.500 毫秒、最久 0.500 毫秒');
    // 搶旗幾乎都輸給攻擊型：列出輸掉的前 10 場（最多 10 場），附上可以重看的指令
    const lostLines = text.split('\n').filter((line) => line.startsWith('  種子 '));
    expect(lostLines.length).toBeGreaterThan(0);
    expect(lostLines.length).toBeLessThanOrEqual(10);
    expect(lostLines[0]).toMatch(/^ {2}種子 \d+，AI 一在 [AB] 隊 → npm run ctf:match -- \w+ \w+ \d+$/);
  });

  it('輸掉的場數超過 10 場時只列前 10 場', () => {
    const result = runTournament({ botOne: 'runner', botTwo: 'attacker', seedCount: 12, startSeed: 1 });
    const losses = result.matches.filter((match) => match.outcome === 'loss');
    expect(losses.length).toBeGreaterThan(10);
    const lostLines = formatTournament(result).filter((line) => line.startsWith('  種子 '));
    expect(lostLines).toHaveLength(10);
    expect(lostLines[0]).toContain(`種子 ${losses[0]!.seed}，AI 一在 ${losses[0]!.botOneTeam} 隊`);
  });

  it('ctf:tournament 認得臨時登記的 AI，而且每一場、每個角色都重新建立它', () => {
    expect(parseTournamentArgs(['memorytest', 'runner', '2']).ok).toBe(false);
    unregister = registerBot(MEMORY_BOT);
    expect(parseTournamentArgs(['memorytest', 'runner', '2'])).toMatchObject({ ok: true, botOne: 'memorytest' });
    const result = runTournament({ botOne: 'memorytest', botTwo: 'runner', seedCount: 2, startSeed: 1 });
    expect(result.matches).toHaveLength(4);
    // 4 場，AI 一依序在 A、B、A、B 隊
    expect(created.map((entry) => entry.characterId)).toEqual(['A1', 'B1', 'A1', 'B1']);
    expect(formatTournament(result)[0]).toBe('批次對打：AI 一 = 記憶測試（memorytest），AI 二 = 搶旗（runner）');
  });
});

describe('docs/ctf-bots.md 第 3、6 節：量時間只在指令這一層', () => {
  it('遊戲核心和 AI 的程式裡沒有用到時間（Date、performance）', () => {
    const files: string[] = [];
    const walk = (folder: string): void => {
      for (const name of readdirSync(folder)) {
        const path = join(folder, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts')) files.push(path);
      }
    };
    walk('games/ctf/core');
    walk('games/ctf/bots');
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      // 拿掉註解再檢查（註解裡會寫「不用 Math.random」這種說明）
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(/\bDate\b|\bperformance\b|Math\.random/.test(code), file).toBe(false);
    }
  });
});
