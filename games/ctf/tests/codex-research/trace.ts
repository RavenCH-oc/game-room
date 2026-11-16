import { writeFileSync } from 'node:fs';
import { createBot, registerBot } from '../../bots/index.ts';
import { createCodex as createDepth2 } from './depth2.ts';
import { createSparring } from './sparring.ts';
import { createInitialState, getCharacterView, resolveRound, type Action } from '../../core/index.ts';

registerBot({ id: 'depth2', name: 'depth2', create: ({ aiSeed, config }) => createDepth2(aiSeed, config) });
for (const style of ['defender', 'interceptor', 'evasive'] as const) {
  registerBot({ id: style, name: style, create: ({ aiSeed, config }) => createSparring(style, aiSeed, config) });
}
const [a = 'codex', b = 'attacker', seedText = '1', label = 'trace'] = process.argv.slice(2);
const seed = Number(seedText);
const bots = { A1: createBot(a, seed, 'A1'), B1: createBot(b, seed, 'B1') };
let state = createInitialState(undefined, seed);
const lines = [JSON.stringify({ a, b, seed, initial: state })];
while (!state.result) {
  const actions: Record<string, Action> = {};
  for (const c of state.characters) if (c.position) actions[c.id] = bots[c.id as 'A1' | 'B1'](getCharacterView(state, c.id));
  const output = resolveRound(state, actions);
  state = output.state;
  lines.push(JSON.stringify({ round: state.round, actions, characters: state.characters, flag: state.flag, scores: state.scores, knockdowns: state.knockdowns, events: output.events, result: state.result }));
}
writeFileSync(`docs/reports/ctf-codex/${label}.jsonl`, lines.join('\n') + '\n');
console.log(JSON.stringify({ a, b, seed, round: state.round, scores: state.scores, knockdowns: state.knockdowns, result: state.result }));
