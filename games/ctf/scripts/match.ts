// 讓兩個範例 AI 對打一整場，在終端機印出每回合的場地、雙方生命值和擊倒數。
// 用法：
//   npm run ctf:match                          （預設：A 隊亂走 vs B 隊搶旗）
//   npm run ctf:match -- attacker runner       （A 隊攻擊型 vs B 隊搶旗）
//   npm run ctf:match -- random attacker 42    （最後的數字是隨機 AI 的種子）
//   npm run ctf:match -- 42                    （只指定種子，AI 用預設）
// AI 名稱：random（亂走）、runner（搶旗）、attacker（攻擊型）

import { createAttacker } from '../bots/attacker.ts';
import { createFlagRunner } from '../bots/flagRunner.ts';
import { createRandomWalker } from '../bots/randomWalker.ts';
import {
  createInitialState,
  getCharacterView,
  resolveRound,
  type ActionMap,
  type Bot,
  type GameEvent,
  type GameResult,
  type GameState,
} from '../core/index.ts';
import { renderBoard } from './renderBoard.ts';

const BOT_KINDS = {
  random: { name: '隨機亂走', create: (seed: number) => createRandomWalker(seed) },
  runner: { name: '搶旗', create: () => createFlagRunner() },
  attacker: { name: '攻擊型', create: () => createAttacker() },
} as const;
type BotKind = keyof typeof BOT_KINDS;

const args = process.argv.slice(2);
const seedText = args.find((arg) => /^\d+$/.test(arg));
const seed = seedText ? Number(seedText) : 1;
const names = args.filter((arg) => arg !== seedText);
const kindA = names[0] ?? 'random';
const kindB = names[1] ?? 'runner';
for (const kind of [kindA, kindB]) {
  if (!(kind in BOT_KINDS)) {
    console.error(`不認得的 AI 名稱：${kind}`);
    console.error('可以用的名稱：random（亂走）、runner（搶旗）、attacker（攻擊型）');
    console.error('例：npm run ctf:match -- attacker runner');
    process.exit(1);
  }
}

const makeEntry = (kind: string): { name: string; bot: Bot } => {
  const entry = BOT_KINDS[kind as BotKind];
  const name = kind === 'random' ? `${entry.name}（種子 ${seed}）` : entry.name;
  return { name, bot: entry.create(seed) };
};
const bots: Record<string, { name: string; bot: Bot }> = {
  A1: makeEntry(kindA),
  B1: makeEntry(kindB),
};

let state: GameState = createInitialState();

console.log(`A 隊：${bots.A1!.name}  vs  B 隊：${bots.B1!.name}`);
console.log('符號：A/B 重生點  F 旗子  # 牆壁  a/b 角色  @ 拿著旗子的角色\n');
console.log('開場');
console.log(renderBoard(state));
console.log(describeStatus(state));

while (!state.result) {
  const wasOvertime = state.phase === 'overtime';
  const actions: ActionMap = {};
  for (const character of state.characters) {
    if (!character.position) continue;
    const entry = bots[character.id];
    if (entry) actions[character.id] = entry.bot(getCharacterView(state, character.id));
  }

  const output = resolveRound(state, actions);
  state = output.state;

  console.log(`\n── 第 ${state.round} 回合${wasOvertime ? '（延長賽）' : ''} ──`);
  console.log(renderBoard(state));
  console.log(describeStatus(state));
  for (const event of output.events) {
    const text = describeEvent(event);
    if (text) console.log(`  · ${text}`);
  }
}

console.log('\n════ 比賽結束 ════');
console.log(
  `最終分數 A ${state.scores.A} : ${state.scores.B} B，` +
    `擊倒數 A ${state.knockdowns.A} : ${state.knockdowns.B} B，共 ${state.round} 回合`,
);
console.log(describeResult(state.result));

/** 場地下方的狀態列：分數、擊倒數、每個角色的生命值 */
function describeStatus(current: GameState): string {
  const hpText = current.characters
    .map((character) => {
      if (!character.position) return `${character.id} 倒地（${character.respawnCountdown} 回合後重生）`;
      const invulnerable = character.invulnerableRoundsLeft > 0 ? '（無敵）' : '';
      return `${character.id} 生命 ${character.hp}${invulnerable}`;
    })
    .join('   ');
  const flag = current.flag;
  const flagText =
    flag.status === 'returning'
      ? `   旗子 ${flag.roundsLeft} 回合後出現在 (${flag.nextPosition.x}, ${flag.nextPosition.y})`
      : '';
  return (
    `  分數 A ${current.scores.A} : ${current.scores.B} B   ` +
    `擊倒數 A ${current.knockdowns.A} : ${current.knockdowns.B} B\n` +
    `  ${hpText}${flagText}`
  );
}

function describeResult(final: GameResult): string {
  switch (final.reason) {
    case 'reachedWinningScore':
      return `${final.winner} 隊先拿到 3 分，獲勝！`;
    case 'higherScore':
      return `正規賽結束，${final.winner} 隊分數較高，獲勝！`;
    case 'moreKnockdowns':
      return `正規賽結束時同分，${final.winner} 隊擊倒數較多，獲勝！`;
    case 'overtimeScore':
      return `延長賽 ${final.winner} 隊先得分，獲勝！`;
    case 'overtimeKnockdown':
      return `延長賽 ${final.winner} 隊先打倒對方，獲勝！`;
    case 'draw':
      return '延長賽也分不出勝負，平手';
  }
}

function describeEvent(event: GameEvent): string | null {
  switch (event.type) {
    case 'invalidAction':
      return `${event.characterId} 的動作不合法（${event.reason}），當作不動`;
    case 'shot': {
      const base = `${event.shooterId} 往 ${event.direction} 射擊`;
      if (event.dodgedId) return `${base}，${event.dodgedId} 閃掉了`;
      if (event.hitId && event.movedIntoLine) return `${base}，${event.hitId} 走進射擊線被打到`;
      return event.hitId ? `${base}，打到 ${event.hitId}` : `${base}，沒打到人`;
    }
    case 'shotBlockedByInvulnerable':
      return `${event.targetId} 無敵中，沒有受傷`;
    case 'damaged':
      return `${event.characterId} 被 ${event.byId} 打中，剩 ${event.hpLeft} 點生命`;
    case 'knockedDown':
      return `${event.characterId} 倒地`;
    case 'flagDropped':
      if (event.reason === 'dropped') return `${event.characterId} 放下旗子`;
      if (event.reason === 'hit') return `${event.characterId} 的旗子被打掉了，掉在 (${event.position.x}, ${event.position.y})`;
      return `${event.characterId} 倒地，旗子掉在 (${event.position.x}, ${event.position.y})`;
    case 'flagPickedUp':
      return `${event.characterId} 撿起旗子`;
    case 'scored':
      return `${event.characterId} 帶旗回家，${event.team} 隊得 1 分`;
    case 'flagReturned':
      return `旗子出現在 (${event.position.x}, ${event.position.y})`;
    case 'respawned':
      return `${event.characterId} 在重生點復活，生命補滿`;
    case 'overtimeStarted':
      return '正規賽結束，分數和擊倒數都相同，進入延長賽！';
    case 'gameOver':
    case 'moved':
    case 'moveBlocked':
      return null;
  }
}
