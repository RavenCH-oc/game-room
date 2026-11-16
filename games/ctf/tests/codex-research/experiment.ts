// 獨立研究入口；正式對戰工具與計分完全不變。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus, release } from 'node:os';
import { createCodex } from '../../bots/codex/index.ts';
import { createCodex as createBaseline } from './baseline.ts';
import { createCodex as createDepth2 } from './depth2.ts';
import { createCodex as createMixed } from './mixed.ts';
import { createCodex as createAdaptive } from './adaptive.ts';
import { createCodex as createSurvival } from './survival.ts';
import { createSparring } from './sparring.ts';
import { registerBot } from '../../bots/index.ts';
import { CTF_CONFIG } from '../../core/index.ts';
import { formatTournament, runTournament } from '../../scripts/tournamentRunner.ts';

const variants = {
  greedy: { safety: 0, future: 0, learning: false },
  cautious: { safety: 0.4, future: 0, learning: false },
  tactical: { safety: 0.15, future: 1, learning: true },
};
for (const [id, options] of Object.entries(variants)) {
  registerBot({ id, name: id, create: ({ aiSeed, config }) => createBaseline(aiSeed, config, options) });
}
registerBot({ id: 'baseline', name: 'baseline', create: ({ aiSeed, config }) => createBaseline(aiSeed, config) });
registerBot({ id: 'depth2', name: 'depth2', create: ({ aiSeed, config }) => createDepth2(aiSeed, config) });
registerBot({ id: 'mixed', name: 'mixed', create: ({ aiSeed, config }) => createMixed(aiSeed, config) });
registerBot({ id: 'adaptive', name: 'adaptive', create: ({ aiSeed, config }) => createAdaptive(aiSeed, config) });
registerBot({ id: 'survival', name: 'survival', create: ({ aiSeed, config }) => createSurvival(aiSeed, config) });
for (const style of ['defender', 'interceptor', 'evasive'] as const) {
  registerBot({ id: style, name: style, create: ({ aiSeed, config }) => createSparring(style, aiSeed, config) });
}
const [one = 'codex', two = 'attacker', count = '30', start = '1', label = 'trial', balance = 'default'] = process.argv.slice(2);
const config = { ...CTF_CONFIG, ...(balance === 'reset' ? { resetOnScore: true } : {}),
  ...(balance === 'nodrop' ? { dropFlagWhenHit: false } : {}) };
const sourceHash = createHash('sha256').update(readFileSync('games/ctf/bots/codex/index.ts')).digest('hex');
const result = runTournament({ botOne: one, botTwo: two, seedCount: Number(count), startSeed: Number(start), config });
const lines = formatTournament(result);
const folder = 'docs/reports/ctf-codex';
mkdirSync(folder, { recursive: true });
const records = result.matches.map(m => ({ seed: m.seed, team: m.botOneTeam, outcome: m.outcome,
  round: m.final.round, scores: m.final.scores, knockdowns: m.final.knockdowns, result: m.final.result }));
const hash = createHash('sha256').update(JSON.stringify(records)).digest('hex');
writeFileSync(`${folder}/${label}.txt`, lines.join('\n') + `\n結果 SHA256: ${hash}\n`);
writeFileSync(`${folder}/${label}.json`, JSON.stringify({ sourceHash, environment: { node: process.version, platform: process.platform, os: release(), cpu: cpus()[0]?.model }, options: result.options, timing: result.timing, hash, records }, null, 2));
console.log(lines.join('\n'));
