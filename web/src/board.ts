// 畫場地，以及射擊的線、被打中的閃光。
// 這裡只負責「畫出來」：規則結算都在伺服器（呼叫遊戲核心），網頁不重算結果。
// v0.6：場地的大小、重生點、牆壁都照伺服器送來的場面裡的地圖畫，不從設定檔讀。

import {
  CTF_CONFIG,
  isEnemySpawn,
  isInsideBoard,
  isWall,
  samePosition,
  step,
  type Direction,
  type GameEvent,
  type GameMap,
  type Position,
  type PublicGameState,
} from '../../games/ctf/core/index.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const config = CTF_CONFIG;

export type Highlight = 'move' | 'shoot' | null;

export interface BoardRenderInput {
  game: PublicGameState;
  myId: string;
  highlight: Highlight;
  /** 剛被打中、要閃一下的角色 */
  flashIds: Set<string>;
}

export interface BoardView {
  render(input: BoardRenderInput): void;
  /** 畫出這回合的射擊線；previous 是結算前的場面 */
  drawShots(previous: PublicGameState, events: GameEvent[]): void;
}

export function createBoard(
  boardElement: HTMLElement,
  shotLayer: SVGSVGElement,
  onCellClick: (position: Position) => void,
): BoardView {
  let cells: HTMLElement[][] = [];
  let gridSize = '';

  /** 地圖大小和現在的格子數不一樣時，重新建立格子（每一場的地圖可能不同） */
  function ensureGrid(map: GameMap): void {
    const size = `${map.width}x${map.height}`;
    if (size === gridSize) return;
    gridSize = size;
    boardElement.replaceChildren();
    boardElement.style.gridTemplateColumns = `repeat(${map.width}, 1fr)`;
    boardElement.style.gridTemplateRows = `repeat(${map.height}, 1fr)`;
    shotLayer.setAttribute('viewBox', `0 0 ${map.width} ${map.height}`);
    cells = [];
    for (let y = 0; y < map.height; y++) {
      const row: HTMLElement[] = [];
      for (let x = 0; x < map.width; x++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.setAttribute('role', 'button');
        cell.setAttribute('aria-label', `格子 (${x}, ${y})`);
        cell.addEventListener('click', () => onCellClick({ x, y }));
        boardElement.appendChild(cell);
        row.push(cell);
      }
      cells.push(row);
    }
  }

  function render(input: BoardRenderInput): void {
    const { game, myId } = input;
    const map = game.map;
    ensureGrid(map);
    const me = game.characters.find((character) => character.id === myId);
    const myPosition = me?.position ?? null;
    const moveTargets = input.highlight === 'move' && me && myPosition ? neighbours(myPosition, me.team, map) : [];
    const shootTargets = input.highlight === 'shoot' && myPosition ? lineCells(myPosition, map) : [];

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const position = { x, y };
        const cell = cells[y]![x]!;
        const classes = ['cell'];
        if (isWall(position, map)) classes.push('wall');
        if (samePosition(position, map.spawnPoints.A)) classes.push('spawn-a');
        if (samePosition(position, map.spawnPoints.B)) classes.push('spawn-b');
        if (moveTargets.some((target) => samePosition(target, position))) classes.push('can-move');
        if (shootTargets.some((target) => samePosition(target, position))) classes.push('can-shoot');
        cell.className = classes.join(' ');
        cell.replaceChildren();

        if (samePosition(position, map.spawnPoints.A)) cell.appendChild(label('A', 'spawn-label'));
        if (samePosition(position, map.spawnPoints.B)) cell.appendChild(label('B', 'spawn-label'));

        const character = game.characters.find((candidate) => candidate.position && samePosition(candidate.position, position));
        if (character) {
          const piece = document.createElement('div');
          piece.className = `piece team-${character.team.toLowerCase()}`;
          if (character.id === myId) piece.classList.add('me');
          if (character.invulnerableRoundsLeft > 0) piece.classList.add('invulnerable');
          if (input.flashIds.has(character.id)) piece.classList.add('hit');
          piece.appendChild(label(character.id === myId ? '你' : '敵', ''));
          piece.appendChild(hpBar(character.hp));
          if (game.flag.status === 'carried' && game.flag.carrierId === character.id) {
            piece.appendChild(label('🚩', 'carried-flag'));
          }
          cell.appendChild(piece);
        } else if (game.flag.status === 'onGround' && samePosition(game.flag.position, position)) {
          cell.appendChild(label('🚩', 'flag'));
        }
        // v0.5：預告階段，在預告的格子上顯示淡淡的旗子和剩餘回合數（隱藏階段場地上什麼都沒有）
        if (game.flag.status === 'announced' && samePosition(game.flag.nextPosition, position)) {
          const preview = document.createElement('div');
          preview.className = 'flag-preview';
          preview.title = `旗子 ${game.flag.roundsLeft} 回合後出現在這裡`;
          preview.appendChild(label('🚩', 'flag'));
          preview.appendChild(label(String(game.flag.roundsLeft), 'flag-preview-rounds'));
          cell.appendChild(preview);
        }
      }
    }
  }

  function drawShots(previous: PublicGameState, events: GameEvent[]): void {
    shotLayer.replaceChildren();
    for (const event of events) {
      if (event.type !== 'shot') continue;
      const shooter = previous.characters.find((character) => character.id === event.shooterId);
      // v0.4：射擊在移動之後判定，子彈停在哪一格由遊戲核心算好放在事件裡
      const end = event.endPosition;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(event.from.x + 0.5));
      line.setAttribute('y1', String(event.from.y + 0.5));
      line.setAttribute('x2', String(end.x + 0.5));
      line.setAttribute('y2', String(end.y + 0.5));
      line.setAttribute('stroke', shooter?.team === 'A' ? '#1d4ed8' : '#b91c1c');
      shotLayer.appendChild(line);
    }
    setTimeout(() => shotLayer.replaceChildren(), 450);
  }

  return { render, drawShots };
}

function label(text: string, className: string): HTMLElement {
  const span = document.createElement('span');
  span.textContent = text;
  if (className) span.className = className;
  return span;
}

function hpBar(hp: number): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'hp';
  bar.title = `生命值 ${hp}`;
  for (let index = 0; index < config.maxHp; index++) {
    const pip = document.createElement('span');
    if (index >= hp) pip.className = 'empty';
    bar.appendChild(pip);
  }
  return bar;
}

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

/** 可以點的移動目標（只是提示；能不能走由伺服器結算決定） */
function neighbours(position: Position, team: 'A' | 'B', map: GameMap): Position[] {
  return DIRECTIONS.map((direction) => step(position, direction)).filter(
    (target) => isInsideBoard(target, map) && !isWall(target, map) && !isEnemySpawn(target, team, map),
  );
}

/** 射擊模式時要標示的格子：四個方向、射程以內、遇到牆停 */
function lineCells(position: Position, map: GameMap): Position[] {
  const result: Position[] = [];
  for (const direction of DIRECTIONS) {
    let cell = position;
    for (let distance = 1; distance <= config.shootRange; distance++) {
      cell = step(cell, direction);
      if (!isInsideBoard(cell, map) || isWall(cell, map)) break;
      result.push(cell);
    }
  }
  return result;
}

/** 點到的格子在自己的哪個方向（同一行或同一列才算） */
export function directionTowards(from: Position, to: Position): Direction | null {
  if (samePosition(from, to)) return null;
  if (from.x === to.x) return to.y < from.y ? 'up' : 'down';
  if (from.y === to.y) return to.x < from.x ? 'left' : 'right';
  return null;
}
