// 回合結算（規則第 4、5、6 節，v0.5）。
// 順序：放旗 → 移動 → 撿旗 → 得分 → 射擊 →（得分後重新開局）→ 重生與倒數，整回合做完才判定勝負。
// 純邏輯：不改傳進來的場面、不計時。需要隨機時只用場面裡的種子亂數，
// 所以同樣的輸入一定得到同樣的輸出。

import {
  isDirection,
  isEnemySpawn,
  isInsideBoard,
  isWall,
  otherTeam,
  samePosition,
  step,
} from './board.ts';
import { CTF_CONFIG, type CtfConfig } from './config.ts';
import { advanceFlagStage, startFlagCycle } from './flag.ts';
import type {
  Action,
  ActionMap,
  Character,
  Direction,
  GameEvent,
  GameResult,
  GameState,
  MoveBlockReason,
  Position,
  ResolveOutput,
  Team,
} from './types.ts';

const STAY: Action = { type: 'stay' };

/**
 * 結算一個回合。
 * 輸入「目前場面」和「每個角色這回合的動作」，
 * 輸出「新的場面」和「這回合發生的事件清單」。
 */
export function resolveRound(
  state: GameState,
  actions: ActionMap,
  config: CtfConfig = CTF_CONFIG,
): ResolveOutput {
  // 比賽已經結束：不再結算，原樣回傳一份複本
  if (state.result) {
    return { state: structuredClone(state), events: [] };
  }

  const next = structuredClone(state);
  const events: GameEvent[] = [];

  const carrierIdAtStart = next.flag.status === 'carried' ? next.flag.carrierId : null;

  // 回合開始時在場的角色，以及他們當時的位置
  const startPositions = new Map<string, Position>();
  for (const character of next.characters) {
    if (character.position) {
      startPositions.set(character.id, { ...character.position });
    }
  }

  // 先把每個在場角色的動作整理好；不合法的動作當作「不動」
  const chosenActions = new Map<string, Action>();
  for (const character of next.characters) {
    if (!character.position) continue;
    const action = normalizeAction(character, actions[character.id], carrierIdAtStart, events);
    chosenActions.set(character.id, action);
  }

  // ── 步驟 1：放下旗子 ──
  for (const character of next.characters) {
    if (!character.position) continue;
    if (chosenActions.get(character.id)?.type !== 'dropFlag') continue;
    next.flag = { status: 'onGround', position: { ...character.position } };
    events.push({
      type: 'flagDropped',
      characterId: character.id,
      position: { ...character.position },
      reason: 'dropped',
    });
  }

  // ── 步驟 2：移動 ──
  const movedIds = resolveMovement(next, chosenActions, config, events);

  // ── 步驟 3：撿旗 ──
  if (next.flag.status === 'onGround') {
    const flagPosition = next.flag.position;
    const picker = next.characters.find(
      (character) =>
        movedIds.has(character.id) &&
        character.position !== null &&
        samePosition(character.position, flagPosition),
    );
    if (picker) {
      next.flag = { status: 'carried', carrierId: picker.id };
      events.push({ type: 'flagPickedUp', characterId: picker.id, position: { ...flagPosition } });
    }
  }

  // ── 步驟 4：得分（在射擊之前，所以子彈攔不下這一分） ──
  let scoredThisRound = false;
  let scoringTeam: Team | null = null;
  if (next.flag.status === 'carried') {
    const carrierId = next.flag.carrierId;
    const carrier = next.characters.find((character) => character.id === carrierId);
    if (
      carrier?.position &&
      samePosition(carrier.position, config.spawnPoints[carrier.team])
    ) {
      next.scores[carrier.team] += 1;
      scoredThisRound = true;
      scoringTeam = carrier.team;
      events.push({
        type: 'scored',
        characterId: carrier.id,
        team: carrier.team,
        scores: { ...next.scores },
      });
      // v0.5：旗子進入「隱藏」階段（回合數設成 0 時直接預告或出現）
      startFlagCycle(next, config, events);
    }
  }

  // ── 步驟 5：射擊（v0.4：以移動之後的位置判定） ──
  const { knockedDownIds, knockdownTeams } = resolveShooting(next, chosenActions, startPositions, config, events);

  // ── 得分後重新開局（v0.5，開關）：射擊結算完、步驟 6 之前 ──
  if (scoredThisRound && config.resetOnScore) {
    resetAllToSpawn(next, config, events);
  }

  // ── 步驟 6：重生與無敵倒數、旗子階段的倒數 ──
  resolveCountdowns(next, knockedDownIds, scoredThisRound, config, events);

  // ── 六個步驟都做完，才判定勝負 ──
  // ── 勝負判定（規則第 6 節） ──
  next.round += 1;
  next.result = decideResult(next, scoringTeam, knockdownTeams, config);
  if (!next.result && next.phase === 'regular' && next.round >= config.regularMaxRounds) {
    next.phase = 'overtime';
    events.push({ type: 'overtimeStarted' });
  }
  if (next.result) {
    events.push({ type: 'gameOver', result: next.result });
  }

  return { state: next, events };
}

/** 檢查動作是否合法；不合法或沒送出都當作「不動」（規則第 3、8 節） */
function normalizeAction(
  character: Character,
  rawAction: unknown,
  carrierIdAtStart: string | null,
  events: GameEvent[],
): Action {
  if (rawAction === undefined || rawAction === null) {
    return STAY;
  }

  const reject = (reason: string): Action => {
    events.push({ type: 'invalidAction', characterId: character.id, action: rawAction, reason });
    return STAY;
  };

  if (typeof rawAction !== 'object' || !('type' in rawAction)) {
    return reject('動作格式不正確');
  }
  const action = rawAction as { type: unknown; direction?: unknown };
  const isCarrier = carrierIdAtStart === character.id;

  switch (action.type) {
    case 'stay':
      return STAY;
    case 'move':
      if (!isDirection(action.direction)) return reject('方向不正確');
      return { type: 'move', direction: action.direction };
    case 'shoot':
      if (!isDirection(action.direction)) return reject('方向不正確');
      if (isCarrier) return reject('持旗者不能射擊');
      return { type: 'shoot', direction: action.direction };
    case 'dropFlag':
      if (!isCarrier) return reject('沒有拿旗不能放旗');
      return { type: 'dropFlag' };
    default:
      return reject('不認得的動作');
  }
}

interface ShootingOutcome {
  /** 這回合倒地的角色 */
  knockedDownIds: Set<string>;
  /** 這回合擊倒數有增加的隊伍（延長賽判定用） */
  knockdownTeams: Set<Team>;
}

/**
 * 步驟 5：所有射擊同時發生，以「移動之後」的位置判定（v0.4），扣生命值，歸零就倒地。
 * 開槍的人這回合沒有移動，從原地開槍。
 */
function resolveShooting(
  next: GameState,
  chosenActions: Map<string, Action>,
  startPositions: Map<string, Position>,
  config: CtfConfig,
  events: GameEvent[],
): ShootingOutcome {
  // 移動之後，在場角色現在的位置
  const positionsNow = new Map<string, Position>();
  for (const character of next.characters) {
    if (character.position) positionsNow.set(character.id, { ...character.position });
  }

  // 被打中的角色 id → 打中他的人（同一回合可能有好幾個）
  const hits = new Map<string, string[]>();

  for (const shooter of next.characters) {
    const action = chosenActions.get(shooter.id);
    const from = positionsNow.get(shooter.id);
    if (action?.type !== 'shoot' || !from) continue;

    // 子彈停在路徑上第一個角色身上；無敵的角色也會擋下子彈
    const { character: target, endPosition } = traceBullet(next, shooter.id, from, action.direction, positionsNow, config);
    // 給畫面用：回合開始時站在這條線上的人，如果現在沒被打到，就是「閃掉了」；
    // 現在被打到的人，回合開始時不是這條線上的第一個人，就是「走進射擊線」
    const atStart = traceBullet(next, shooter.id, from, action.direction, startPositions, config).character;
    events.push({
      type: 'shot',
      shooterId: shooter.id,
      direction: action.direction,
      from: { ...from },
      endPosition,
      hitId: target?.id ?? null,
      dodgedId: atStart && atStart.id !== target?.id ? atStart.id : null,
      movedIntoLine: target !== null && atStart?.id !== target.id,
    });
    if (!target) continue;

    if (target.invulnerableRoundsLeft > 0) {
      events.push({ type: 'shotBlockedByInvulnerable', shooterId: shooter.id, targetId: target.id });
      continue;
    }
    hits.set(target.id, [...(hits.get(target.id) ?? []), shooter.id]);
  }

  // 射擊全部判定完才一起扣血，所以互相打中會各扣 1 點
  const knockedDownIds = new Set<string>();
  const knockdownTeams = new Set<Team>();

  for (const [targetId, shooterIds] of hits) {
    const target = next.characters.find((character) => character.id === targetId)!;

    // 每一槍各扣一次
    for (const shooterId of shooterIds) {
      target.hp = Math.max(0, target.hp - config.shotDamage);
      events.push({ type: 'damaged', characterId: targetId, byId: shooterId, damage: config.shotDamage, hpLeft: target.hp });
    }
    // 旗子掉在他「現在站的那一格」（移動之後）
    const position = positionsNow.get(targetId)!;
    // 這回合剛得分的人已經沒有旗子；剛撿起旗子的人算持旗者
    const isCarrier = next.flag.status === 'carried' && next.flag.carrierId === targetId;

    if (target.hp > 0) {
      // 持旗者被打中但沒倒地，旗子也會掉（開關打開時）。撿旗步驟已經過了，下一回合才能撿
      if (isCarrier && config.dropFlagWhenHit) {
        next.flag = { status: 'onGround', position: { ...position } };
        events.push({ type: 'flagDropped', characterId: targetId, position: { ...position }, reason: 'hit' });
      }
      continue;
    }

    // 生命值歸零：倒地。不管幾個人打中，一個角色倒地只算 1 次擊倒
    const creditedTeam = otherTeam(target.team);
    next.knockdowns[creditedTeam] += 1;
    knockdownTeams.add(creditedTeam);
    knockedDownIds.add(targetId);
    events.push({ type: 'knockedDown', characterId: targetId, byIds: [...shooterIds], position: { ...position } });

    if (isCarrier) {
      next.flag = { status: 'onGround', position: { ...position } };
      events.push({ type: 'flagDropped', characterId: targetId, position: { ...position }, reason: 'knockedDown' });
    }

    target.position = null;
    target.respawnCountdown = config.knockedDownRounds;
    target.invulnerableRoundsLeft = 0;
  }

  return { knockedDownIds, knockdownTeams };
}

/**
 * 子彈的路徑：直線最遠 shootRange 格，停在路徑上第一個角色身上；遇到牆壁或場外就停。
 * positions 決定「角色在哪裡」（判定用移動後的位置）。
 * 回傳打到的角色，以及子彈停下的格子（給畫面畫線用）。
 */
function traceBullet(
  state: GameState,
  shooterId: string,
  from: Position,
  direction: Direction,
  positions: Map<string, Position>,
  config: CtfConfig,
): { character: Character | null; endPosition: Position } {
  let cell = from;
  for (let distance = 1; distance <= config.shootRange; distance++) {
    const nextCell = step(cell, direction);
    if (!isInsideBoard(nextCell, config) || isWall(nextCell, config)) break;
    cell = nextCell;
    const found = state.characters.find((character) => {
      if (character.id === shooterId) return false;
      const position = positions.get(character.id);
      return position !== undefined && samePosition(position, cell);
    });
    if (found) return { character: found, endPosition: { ...cell } };
  }
  return { character: null, endPosition: { ...cell } };
}

interface MovePlan {
  character: Character;
  from: Position;
  to: Position;
  direction: Direction;
}

/** 步驟 2：所有移動同時發生，回傳這回合真的有移動的角色 id */
function resolveMovement(
  next: GameState,
  chosenActions: Map<string, Action>,
  config: CtfConfig,
  events: GameEvent[],
): Set<string> {
  const plans: MovePlan[] = [];

  for (const character of next.characters) {
    if (!character.position) continue;
    const action = chosenActions.get(character.id);
    if (action?.type !== 'move') continue;

    const from = character.position;
    const to = step(from, action.direction);
    let reason: MoveBlockReason | null = null;
    if (!isInsideBoard(to, config)) reason = 'outOfBounds';
    else if (isWall(to, config)) reason = 'wall';
    else if (isEnemySpawn(to, character.team, config)) reason = 'enemySpawn';

    if (reason) {
      events.push({ type: 'moveBlocked', characterId: character.id, from: { ...from }, direction: action.direction, reason });
    } else {
      plans.push({ character, from, to, direction: action.direction });
    }
  }

  // 反覆檢查衝突，直到沒有新的人被彈回為止
  // （有人彈回原位後，可能又擋到別人）
  const blocked = new Map<string, MoveBlockReason>();
  const block = (plan: MovePlan, reason: MoveBlockReason): void => {
    if (!blocked.has(plan.character.id)) blocked.set(plan.character.id, reason);
  };

  let changed = true;
  while (changed) {
    const before = blocked.size;
    const active = plans.filter((plan) => !blocked.has(plan.character.id));

    // 兩個角色要走進同一格：兩邊都彈回
    for (const a of active) {
      for (const b of active) {
        if (a !== b && samePosition(a.to, b.to)) {
          block(a, 'sameTarget');
          block(b, 'sameTarget');
        }
      }
    }

    // 兩個角色互換位置：兩邊都彈回
    for (const a of active) {
      for (const b of active) {
        if (a !== b && samePosition(a.to, b.from) && samePosition(b.to, a.from)) {
          block(a, 'swap');
          block(b, 'swap');
        }
      }
    }

    // 走向一個這回合沒有離開的角色所在的格子：留在原位
    const stillActiveIds = new Set(
      plans.filter((plan) => !blocked.has(plan.character.id)).map((plan) => plan.character.id),
    );
    const occupiedCells = next.characters
      .filter((character) => character.position && !stillActiveIds.has(character.id))
      .map((character) => character.position!);
    for (const plan of plans) {
      if (!stillActiveIds.has(plan.character.id)) continue;
      if (occupiedCells.some((cell) => samePosition(cell, plan.to))) {
        block(plan, 'occupied');
      }
    }

    changed = blocked.size !== before;
  }

  const movedIds = new Set<string>();
  for (const plan of plans) {
    const reason = blocked.get(plan.character.id);
    if (reason) {
      events.push({ type: 'moveBlocked', characterId: plan.character.id, from: { ...plan.from }, direction: plan.direction, reason });
      continue;
    }
    plan.character.position = { ...plan.to };
    movedIds.add(plan.character.id);
    events.push({ type: 'moved', characterId: plan.character.id, from: { ...plan.from }, to: { ...plan.to } });
  }
  return movedIds;
}

/**
 * 得分後重新開局（v0.5）：所有角色（包含倒地離場中的、這回合剛倒地的）
 * 回到自己的重生點、生命值補滿、離場倒數和無敵都歸零。這種回場不給無敵。
 */
function resetAllToSpawn(next: GameState, config: CtfConfig, events: GameEvent[]): void {
  for (const character of next.characters) {
    character.position = { ...config.spawnPoints[character.team] };
    character.hp = config.maxHp;
    character.respawnCountdown = 0;
    character.invulnerableRoundsLeft = 0;
  }
  events.push({ type: 'resetAfterScore' });
}

/** 步驟 6：無敵倒數、重生倒數、旗子階段的倒數 */
function resolveCountdowns(
  next: GameState,
  knockedDownIds: Set<string>,
  scoredThisRound: boolean,
  config: CtfConfig,
  events: GameEvent[],
): void {
  // 在場角色的無敵少一回合（這回合才重生的角色不在這裡扣）
  for (const character of next.characters) {
    if (character.position && character.invulnerableRoundsLeft > 0) {
      character.invulnerableRoundsLeft -= 1;
    }
  }

  // 離場角色：這回合才倒地的不扣，之前就離場的扣一回合；扣到 0 就重生
  for (const character of next.characters) {
    if (character.position) continue;
    if (!knockedDownIds.has(character.id)) {
      character.respawnCountdown -= 1;
    }
    if (character.respawnCountdown <= 0) {
      const spawn = config.spawnPoints[character.team];
      character.position = { ...spawn };
      character.respawnCountdown = 0;
      character.hp = config.maxHp;
      character.invulnerableRoundsLeft = config.invulnerableRounds;
      events.push({ type: 'respawned', characterId: character.id, position: { ...spawn }, hp: character.hp });
    }
  }

  // 旗子（v0.5）：目前階段的剩餘回合數減 1；這回合才得分的不減
  if (!scoredThisRound) {
    advanceFlagStage(next, config, events);
  }
}

/**
 * 這回合結算完之後判定勝負（規則第 6 節）。還沒分出勝負時回傳 null。
 * 呼叫時 state.round 已經是「剛結算完的回合數」。
 */
function decideResult(
  state: GameState,
  scoringTeam: Team | null,
  knockdownTeams: Set<Team>,
  config: CtfConfig,
): GameResult | null {
  if (state.phase === 'regular') {
    // 先拿到 3 分立刻獲勝（第 200 回合當中拿到也算）
    if (scoringTeam && state.scores[scoringTeam] >= config.winningScore) {
      return { winner: scoringTeam, reason: 'reachedWinningScore' };
    }
    if (state.round < config.regularMaxRounds) return null;

    // 第 200 回合結算完：先比分數，再比擊倒數，都一樣就進延長賽（回傳 null）
    if (state.scores.A !== state.scores.B) {
      return { winner: state.scores.A > state.scores.B ? 'A' : 'B', reason: 'higherScore' };
    }
    if (state.knockdowns.A !== state.knockdowns.B) {
      return { winner: state.knockdowns.A > state.knockdowns.B ? 'A' : 'B', reason: 'moreKnockdowns' };
    }
    return null;
  }

  // 延長賽：先得 1 分的獲勝
  if (scoringTeam) {
    return { winner: scoringTeam, reason: 'overtimeScore' };
  }
  // 延長賽：只有一隊打倒對方就獲勝；同一回合雙方互相打倒則繼續
  if (knockdownTeams.size === 1) {
    const [team] = [...knockdownTeams];
    return { winner: team!, reason: 'overtimeKnockdown' };
  }
  // 延長賽回合上限到了：平手
  if (state.round >= config.regularMaxRounds + config.overtimeMaxRounds) {
    return { winner: null, reason: 'draw' };
  }
  return null;
}
