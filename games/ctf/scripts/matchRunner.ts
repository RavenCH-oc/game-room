// 讓兩個範例 AI 對打一整場，產生要印在終端機的每一行文字（規則第 8 節）。
// 對打指令（match.ts）和測試共用：同樣的 AI 組合加同樣的種子，產生的文字完全一樣。
// v0.5：種子就是這場比賽的種子，同時決定旗子位置和兩邊 AI 的隨機行為。

import { BOT_NAMES, createBot, type BotKind } from '../bots/index.ts';
import {
  CTF_CONFIG,
  createInitialState,
  getCharacterView,
  resolveRound,
  type ActionMap,
  type Bot,
  type CtfConfig,
  type GameEvent,
  type GameResult,
  type GameState,
  type PublicGameState,
} from '../core/index.ts';
import { renderBoard } from './renderBoard.ts';

export interface MatchOutput {
  /** 要印出來的每一行 */
  lines: string[];
  /** 比賽結束時的場面 */
  finalState: GameState;
}

/** 讓兩個 AI 打完一整場，回傳結束時的場面（測試用） */
export function playMatch(kindA: BotKind, kindB: BotKind, seed: number, config: CtfConfig = CTF_CONFIG): GameState {
  return runMatch(kindA, kindB, seed, config).finalState;
}

export function runMatch(kindA: BotKind, kindB: BotKind, seed: number, config: CtfConfig = CTF_CONFIG): MatchOutput {
  const lines: string[] = [];
  const print = (text: string): void => {
    lines.push(...text.split('\n'));
  };

  // 每一場都重新建立 AI；AI 種子由比賽種子和角色 id 算出
  const bots: Record<string, Bot> = {
    A1: createBot(kindA, seed, 'A1', config),
    B1: createBot(kindB, seed, 'B1', config),
  };

  let state: GameState = createInitialState(config, seed);

  print(`種子：${seed}`);
  print(`A 隊：${BOT_NAMES[kindA]}  vs  B 隊：${BOT_NAMES[kindB]}`);
  print('符號：A/B 重生點  F 旗子  # 牆壁  a/b 角色  @ 拿著旗子的角色');
  print('');
  print('開場');
  print(renderBoard(state));
  print(describeStatus(state));

  while (!state.result) {
    const wasOvertime = state.phase === 'overtime';
    const actions: ActionMap = {};
    for (const character of state.characters) {
      if (!character.position) continue;
      const bot = bots[character.id];
      // AI 看到的場面不含種子和亂數狀態
      if (bot) actions[character.id] = bot(getCharacterView(state, character.id));
    }

    const output = resolveRound(state, actions, config);
    state = output.state;

    print('');
    print(`── 第 ${state.round} 回合${wasOvertime ? '（延長賽）' : ''} ──`);
    print(renderBoard(state));
    print(describeStatus(state));
    for (const event of output.events) {
      const text = describeEvent(event);
      if (text) print(`  · ${text}`);
    }
  }

  print('');
  print('════ 比賽結束 ════');
  print(
    `最終分數 A ${state.scores.A} : ${state.scores.B} B，` +
      `擊倒數 A ${state.knockdowns.A} : ${state.knockdowns.B} B，共 ${state.round} 回合`,
  );
  print(describeResult(state.result));
  print(`種子：${seed}`);
  return { lines, finalState: state };
}

/** 場地下方的狀態列：分數、擊倒數、每個角色的生命值、旗子的階段 */
function describeStatus(current: PublicGameState): string {
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
    `  ${hpText}${describeFlag(current)}`
  );
}

/** v0.5：隱藏期間印「旗子還沒出現，幾回合後公布位置」，預告期間印位置和剩餘回合數 */
function describeFlag(current: PublicGameState): string {
  const flag = current.flag;
  if (flag.status === 'hidden') return `   旗子還沒出現，${flag.roundsLeft} 回合後公布位置`;
  if (flag.status === 'announced') {
    return `   旗子 ${flag.roundsLeft} 回合後出現在 (${flag.nextPosition.x}, ${flag.nextPosition.y})`;
  }
  return '';
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
    case 'flagAnnounced':
      return `旗子將出現在 (${event.position.x}, ${event.position.y})，${event.roundsLeft} 回合後出現`;
    case 'flagAppeared':
      return `旗子出現在 (${event.position.x}, ${event.position.y})`;
    case 'resetAfterScore':
      return '雙方回到重生點，生命補滿';
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
