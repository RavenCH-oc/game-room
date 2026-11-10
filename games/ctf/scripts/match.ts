// 讓兩個範例 AI 對打一整場，在終端機印出每回合的場地、雙方生命值和擊倒數。
// 用法：npm run ctf:match            （隨機 AI 用預設種子 1）
//       npm run ctf:match -- 42      （指定隨機 AI 的種子）

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

const seedArgument = Number(process.argv[2]);
const seed = Number.isFinite(seedArgument) ? seedArgument : 1;

const bots: Record<string, { name: string; bot: Bot }> = {
  A1: { name: '隨機亂走', bot: createRandomWalker(seed) },
  B1: { name: '直接搶旗', bot: createFlagRunner() },
};

let state: GameState = createInitialState();

console.log(`A 隊：${bots.A1!.name}（種子 ${seed}）  vs  B 隊：${bots.B1!.name}`);
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
  return (
    `  分數 A ${current.scores.A} : ${current.scores.B} B   ` +
    `擊倒數 A ${current.knockdowns.A} : ${current.knockdowns.B} B\n` +
    `  ${hpText}`
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
    case 'shot':
      return `${event.shooterId} 往 ${event.direction} 射擊${event.hitId ? `，打到 ${event.hitId}` : '，沒打到人'}`;
    case 'shotBlockedByInvulnerable':
      return `${event.targetId} 無敵中，沒有受傷`;
    case 'damaged':
      return `${event.characterId} 被 ${event.byId} 打中，剩 ${event.hpLeft} 點生命`;
    case 'knockedDown':
      return `${event.characterId} 倒地`;
    case 'flagDropped':
      return event.reason === 'dropped'
        ? `${event.characterId} 放下旗子`
        : `${event.characterId} 倒地，旗子掉在 (${event.position.x}, ${event.position.y})`;
    case 'flagPickedUp':
      return `${event.characterId} 撿起旗子`;
    case 'scored':
      return `${event.characterId} 帶旗回家，${event.team} 隊得 1 分`;
    case 'flagReturned':
      return '旗子回到中央';
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
