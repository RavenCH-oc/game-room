// 讓兩個範例 AI 對打一整場，在終端機印出每回合的場地。
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

while (!state.result) {
  const actions: ActionMap = {};
  for (const character of state.characters) {
    if (!character.position) continue;
    const entry = bots[character.id];
    if (entry) actions[character.id] = entry.bot(getCharacterView(state, character.id));
  }

  const output = resolveRound(state, actions);
  state = output.state;

  console.log(`\n── 第 ${state.round} 回合 ──  分數 A ${state.scores.A} : ${state.scores.B} B`);
  console.log(renderBoard(state));
  for (const event of output.events) {
    const text = describeEvent(event);
    if (text) console.log(`  · ${text}`);
  }
}

const result = state.result;
console.log('\n════ 比賽結束 ════');
console.log(`最終分數 A ${state.scores.A} : ${state.scores.B} B，共 ${state.round} 回合`);
console.log(result.winner ? `${result.winner} 隊獲勝！` : '平手');

function describeEvent(event: GameEvent): string | null {
  switch (event.type) {
    case 'invalidAction':
      return `${event.characterId} 的動作不合法（${event.reason}），當作不動`;
    case 'shot':
      return `${event.shooterId} 往 ${event.direction} 射擊${event.hitId ? `，打到 ${event.hitId}` : '，沒打到人'}`;
    case 'shotBlockedByInvulnerable':
      return `${event.targetId} 無敵中，沒被打倒`;
    case 'eliminated':
      return `${event.characterId} 被 ${event.byId} 淘汰`;
    case 'flagDropped':
      return event.reason === 'dropped'
        ? `${event.characterId} 放下旗子`
        : `${event.characterId} 被淘汰，旗子掉在 (${event.position.x}, ${event.position.y})`;
    case 'flagPickedUp':
      return `${event.characterId} 撿起旗子`;
    case 'scored':
      return `${event.characterId} 帶旗回家，${event.team} 隊得 1 分`;
    case 'flagReturned':
      return '旗子回到中央';
    case 'respawned':
      return `${event.characterId} 在重生點復活`;
    case 'gameOver':
      return null;
    case 'moved':
    case 'moveBlocked':
      return null;
  }
}
