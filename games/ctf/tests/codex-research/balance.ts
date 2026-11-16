// 平衡研究：配置只存在本程式的區域變數，不修改正式設定。
import { writeFileSync } from 'node:fs';
import { CTF_CONFIG, type GameState } from '../../core/index.ts';
import { registerBot } from '../../bots/index.ts';
import { createMatchBots, playGame } from '../../scripts/matchRunner.ts';
import { createSparring } from './sparring.ts';

for (const style of ['defender', 'interceptor', 'evasive'] as const) {
  registerBot({ id: style, name: style, create: ({ aiSeed, config }) => createSparring(style, aiSeed, config) });
}
const [one = 'codex', two = 'codex', countText = '30', startText = '91', mode = 'default', label = 'balance'] = process.argv.slice(2);
const config = { ...CTF_CONFIG, ...(mode === 'reset' ? { resetOnScore: true } : {}), ...(mode === 'nodrop' ? { dropFlagWhenHit: false } : {}) };
const records = [];
for (let seed = Number(startText); seed < Number(startText) + Number(countText); seed++) {
  for (const team of ['A', 'B'] as const) {
    let previous = '';
    let quiet = 0;
    let maxQuiet = 0;
    let shots = 0;
    let hits = 0;
    let blocks = 0;
    let simultaneousKnockdowns = 0;
    let spawnHits = 0;
    const scores: { round: number; team: string }[] = [];
    const fingerprint = (s: GameState): string => JSON.stringify([s.characters, s.flag, s.scores, s.knockdowns]);
    const bots = createMatchBots(team === 'A' ? one : two, team === 'A' ? two : one, seed, config);
    const final = playGame(bots, seed, config, (state, events) => {
      const current = fingerprint(state);
      quiet = current === previous ? quiet + 1 : 0;
      previous = current;
      maxQuiet = Math.max(maxQuiet, quiet);
      if (events.filter(e => e.type === 'knockedDown').length === 2) simultaneousKnockdowns++;
      for (const event of events) {
        if (event.type === 'moveBlocked') blocks++;
        if (event.type === 'shot') shots++;
        if (event.type === 'damaged') {
          hits++;
          const c = state.characters.find(c => c.id === event.characterId)!;
          const death = events.find(e => e.type === 'knockedDown' && e.characterId === c.id);
          const p = c.position ?? (death?.type === 'knockedDown' ? death.position : null);
          const home = state.map.spawnPoints[c.team];
          if (p && Math.abs(p.x - home.x) + Math.abs(p.y - home.y) <= 2) spawnHits++;
        }
        if (event.type === 'scored') scores.push({ round: state.round, team: event.team });
      }
    });
    records.push({ seed, team, outcome: final.result?.winner === null ? 'draw' : final.result?.winner === team ? 'win' : 'loss',
      round: final.round, scores, finalScores: final.scores, knockdowns: final.knockdowns, shots, hits, blocks, simultaneousKnockdowns, spawnHits, maxQuiet });
  }
}
const summary = {
  one, two, mode, count: records.length, start: Number(startText),
  wins: records.filter(r => r.outcome === 'win').length, losses: records.filter(r => r.outcome === 'loss').length,
  draws: records.filter(r => r.outcome === 'draw').length,
  meanRounds: records.reduce((sum, r) => sum + r.round, 0) / records.length,
  maxQuiet: Math.max(...records.map(r => r.maxQuiet)),
  quietOver30: records.filter(r => r.maxQuiet >= 30).length,
  simultaneousKnockdowns: records.reduce((sum, r) => sum + r.simultaneousKnockdowns, 0),
  spawnHits: records.reduce((sum, r) => sum + r.spawnHits, 0),
  consecutiveScores: records.reduce((sum, r) => sum + r.scores.filter((s, i) => i > 0 && s.team === r.scores[i - 1]!.team).length, 0),
  scoreTransitions: records.reduce((sum, r) => sum + Math.max(0, r.scores.length - 1), 0),
};
writeFileSync(`docs/reports/ctf-codex/${label}.json`, JSON.stringify({ summary, config, records }, null, 2));
console.log(JSON.stringify(summary, null, 2));
