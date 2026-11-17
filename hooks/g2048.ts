/**
 * 2048, as pure functions: a board is 16 numbers, row-major, 0 for an empty
 * cell. Nothing here touches the engine, so the tests hold every rule of the
 * game without a session.
 *
 * The game was chosen for the pane because it needs no explanation and one
 * keypress is one move, which is exactly what a pane Button's `hotkey` gives:
 * w, a, s, d and nothing held down.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

export type Board = {
  /** 16 cells, row-major. */
  cells: number[]
  score: number
  /** The best score this machine has seen, kept across sessions. */
  best: number
  /** True once no move changes the board. */
  isOver: boolean
}

export const SIZE = 4
export const CELLS = SIZE * SIZE

export const emptyCells = (cells: readonly number[]): number[] => {
  const out: number[] = []
  for (let i = 0; i < cells.length; i++) if (cells[i] === 0) out.push(i)
  return out
}

/** Puts a 2 (nine times in ten) or a 4 on a free cell. */
export function spawn(cells: readonly number[], rnd: () => number): number[] {
  const free = emptyCells(cells)
  const out = [...cells]
  if (free.length === 0) return out
  const at = free[Math.floor(rnd() * free.length) % free.length]
  if (at === undefined) return out
  out[at] = rnd() < 0.9 ? 2 : 4
  return out
}

/**
 * Slides one line towards its head and merges equal neighbours once each,
 * which is the whole rule of the game: `[2,2,4,0]` becomes `[4,4,0,0]`.
 */
export function slide(line: readonly number[]): { line: number[]; gained: number } {
  const values = line.filter(v => v !== 0)
  const out: number[] = []
  let gained = 0
  for (let i = 0; i < values.length; i++) {
    const here = values[i] as number
    if (values[i + 1] === here) {
      out.push(here * 2)
      gained += here * 2
      i++
    } else {
      out.push(here)
    }
  }
  while (out.length < SIZE) out.push(0)
  return { line: out, gained }
}

/** Where cell `j` of line `i` sits on the board, for a slide in `dir`. */
function indexOf(dir: Direction, i: number, j: number): number {
  if (dir === 'left') return i * SIZE + j
  if (dir === 'right') return i * SIZE + (SIZE - 1 - j)
  if (dir === 'up') return j * SIZE + i
  return (SIZE - 1 - j) * SIZE + i
}

export function move(cells: readonly number[], dir: Direction): { cells: number[]; gained: number; hasMoved: boolean } {
  const out = [...cells]
  let gained = 0
  for (let i = 0; i < SIZE; i++) {
    const line: number[] = []
    for (let j = 0; j < SIZE; j++) line.push(cells[indexOf(dir, i, j)] as number)
    const slid = slide(line)
    gained += slid.gained
    for (let j = 0; j < SIZE; j++) out[indexOf(dir, i, j)] = slid.line[j] as number
  }
  return { cells: out, gained, hasMoved: out.some((v, i) => v !== cells[i]) }
}

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

/** Whether any direction still changes the board. */
export const canMove = (cells: readonly number[]): boolean =>
  DIRECTIONS.some(dir => move(cells, dir).hasMoved)

export function newBoard(rnd: () => number, best = 0): Board {
  let cells = new Array<number>(CELLS).fill(0)
  cells = spawn(cells, rnd)
  cells = spawn(cells, rnd)
  return { cells, score: 0, best, isOver: false }
}

/** One turn: slide, and where that changed anything, drop a new tile. */
export function play(board: Board, dir: Direction, rnd: () => number): Board {
  const slid = move(board.cells, dir)
  if (!slid.hasMoved) return board
  const cells = spawn(slid.cells, rnd)
  const score = board.score + slid.gained
  return { cells, score, best: Math.max(board.best, score), isOver: !canMove(cells) }
}

/** The highest tile, which is how a player says how a game went. */
export const highest = (cells: readonly number[]): number => cells.reduce((a, b) => (b > a ? b : a), 0)

/** The board drawn as the pane's rows, each cell in a column six cells wide. */
export function draw(cells: readonly number[]): string[] {
  const line = (l: string, m: string, r: string) => l + [0, 1, 2, 3].map(() => '──────').join(m) + r
  const rows: string[] = [line('┌', '┬', '┐')]
  for (let r = 0; r < SIZE; r++) {
    let row = '│'
    for (let c = 0; c < SIZE; c++) {
      const value = cells[r * SIZE + c] ?? 0
      const text = value === 0 ? '·' : String(value)
      const pad = 6 - text.length
      const left = Math.floor(pad / 2)
      row += ' '.repeat(left) + text + ' '.repeat(pad - left) + '│'
    }
    rows.push(row)
    rows.push(r < SIZE - 1 ? line('├', '┼', '┤') : line('└', '┴', '┘'))
  }
  return rows
}
