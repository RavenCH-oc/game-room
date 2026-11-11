// 把事件和結果轉成白話文字（從「你」的角度）。

import type { Action, GameEvent, Team } from '../../games/ctf/core/index.ts';
import type { MatchResult } from '../../server/protocol.ts';

const DIRECTION_TEXT = { up: '上', down: '下', left: '左', right: '右' } as const;

export function describeAction(action: Action): string {
  switch (action.type) {
    case 'move':
      return `往${DIRECTION_TEXT[action.direction]}移動`;
    case 'shoot':
      return `往${DIRECTION_TEXT[action.direction]}射擊`;
    case 'dropFlag':
      return '放下旗子';
    case 'stay':
      return '不動';
  }
}

/** 把一個事件轉成一句話；不值得顯示的回傳 null */
export function describeEvent(event: GameEvent, myId: string): string | null {
  const who = (id: string): string => (id === myId ? '你' : '對手');
  switch (event.type) {
    case 'shot':
      return event.hitId ? null : `${who(event.shooterId)}往${DIRECTION_TEXT[event.direction]}開槍，沒打到人`;
    case 'damaged':
      return `${who(event.byId)}打中${who(event.characterId)}，${who(event.characterId)}剩 ${event.hpLeft} 點生命`;
    case 'shotBlockedByInvulnerable':
      return `${who(event.targetId)}在無敵中，子彈被擋下`;
    case 'knockedDown':
      return `${who(event.characterId)}倒地了！`;
    case 'flagDropped':
      if (event.reason === 'dropped') return `${who(event.characterId)}放下旗子`;
      if (event.reason === 'hit') return `${who(event.characterId)}的旗子被打掉了！`;
      return '旗子掉在地上';
    case 'flagPickedUp':
      return `${who(event.characterId)}撿起旗子`;
    case 'scored':
      return `${who(event.characterId)}帶旗回家，得 1 分！`;
    case 'flagReturned':
      return '旗子重新出現了';
    case 'respawned':
      return `${who(event.characterId)}在重生點復活`;
    case 'overtimeStarted':
      return '分數和擊倒數都相同，進入延長賽！';
    case 'invalidAction':
      return event.characterId === myId ? `你的動作無效（${event.reason}），當作不動` : null;
    case 'moveBlocked':
      return event.characterId === myId && (event.reason === 'sameTarget' || event.reason === 'swap' || event.reason === 'occupied')
        ? '你被對手擋住，留在原地'
        : null;
    case 'moved':
    case 'gameOver':
      return null;
  }
}

export function describeResult(result: MatchResult, myTeam: Team): { title: string; reason: string } {
  const title = result.winner === null ? '平手' : result.winner === myTeam ? '你贏了！' : '你輸了';
  const winnerText = result.winner === null ? '' : result.winner === myTeam ? '你' : '對手';
  switch (result.reason) {
    case 'reachedWinningScore':
      return { title, reason: `${winnerText}先拿到 3 分` };
    case 'higherScore':
      return { title, reason: `200 回合結束，${winnerText}分數較高` };
    case 'moreKnockdowns':
      return { title, reason: `200 回合結束同分，${winnerText}擊倒數較多` };
    case 'overtimeScore':
      return { title, reason: `延長賽${winnerText}先得分` };
    case 'overtimeKnockdown':
      return { title, reason: `延長賽${winnerText}先打倒對方` };
    case 'opponentLeft':
      return { title, reason: '對手離開' };
    case 'draw':
      return { title, reason: '延長賽 50 回合仍分不出勝負' };
  }
}
