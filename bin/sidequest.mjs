/**
 * Sidequest, standing on its own in a terminal of its own.
 *
 * The pane version lives inside Claude Code and therefore inside every rule
 * Claude Code's terminal layout has: a pane is docked beside the transcript
 * only in the fullscreen layout, a click is reported only there too, a hotkey
 * presses only while the pane holds the keyboard, and the keys a pane never
 * sees are the ones the engine or the IDE took first. None of that is the
 * pane's to fix.
 *
 * Run beside Claude Code in a split instead, this program owns its terminal.
 * It reads its own keys, turns on its own mouse reporting, and takes up no
 * room Claude Code wanted — so the sidebar and the scrollback stop being the
 * same switch.
 *
 * The rules of both games come from the same modules the pane uses, so there
 * is one 2048 and one Codele in this repository, not two that drift.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, extname } from 'node:path'

import { newBoard, play, draw, highest, canMove } from '../hooks/g2048.ts'
import {
  DEFAULT_LENGTH,
  ENOUGH,
  LENGTHS,
  TRIES,
  AVOID,
  grade,
  guess as applyGuess,
  isSourceFile,
  letterMarks,
  newGame,
  pickFrom,
  poolFor,
} from '../hooks/codele.ts'

// ----------------------------------------------------------------- the terminal

const OUT = process.stdout
const ESC = '\x1b'
const CSI = `${ESC}[`

/** Colours by name, so the drawing below reads as what it means. */
const C = {
  reset: `${CSI}0m`,
  dim: `${CSI}2m`,
  bold: `${CSI}1m`,
  rev: `${CSI}7m`,
  red: `${CSI}31m`,
  green: `${CSI}32m`,
  yellow: `${CSI}33m`,
  blue: `${CSI}34m`,
  magenta: `${CSI}35m`,
  cyan: `${CSI}36m`,
  grey: `${CSI}90m`,
}

/**
 * No alternate screen, deliberately. This program's own terminal is small and
 * its drawing is short, so it repaints in place from the top: the scrollback
 * of the pane it runs in stays whatever the person had, and quitting leaves
 * the last board on screen rather than wiping it.
 */
const show = (text) => OUT.write(`${CSI}H${CSI}J${text}`)

const hideCursor = () => OUT.write(`${CSI}?25l`)
const showCursor = () => OUT.write(`${CSI}?25h`)

/**
 * Mouse reporting, ours to turn on because the terminal is ours: 1000 is
 * button events, 1006 the SGR encoding that survives past column 95. Claude
 * Code enables neither on the main screen, which is why a pane's buttons
 * cannot be clicked there and these can.
 */
const mouseOn = () => OUT.write(`${CSI}?1000h${CSI}?1006h`)
const mouseOff = () => OUT.write(`${CSI}?1006l${CSI}?1000l`)

// ------------------------------------------------------------------ the project

const CWD = process.cwd()

/** Folders never worth walking into: someone else's code, or build output. */
const SKIP = new Set([
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'coverage',
  '.git', '.next', '.venv', 'venv', '__pycache__', '.cache', 'tmp',
])

const PROSE = /\.(md|markdown|txt|rst|adoc|ya?ml|twig|html?|sql|toml|ini|cfg|po)$/i

/** What git knows about, when git knows anything; the folder itself otherwise. */
function projectFiles() {
  const ls = spawnSync('git', ['ls-files'], { cwd: CWD, encoding: 'utf8', timeout: 4000 })
  if (ls.status === 0 && ls.stdout.trim() !== '') {
    return ls.stdout.split('\n').map(s => s.trim()).filter(Boolean)
  }
  const found = []
  const walk = (dir, depth) => {
    if (depth > 4 || found.length > 400) return
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (found.length > 400) return
      if (entry.name.startsWith('.') && entry.name !== '.github') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(full, depth + 1)
      } else if (isSourceFile(entry.name) || PROSE.test(entry.name)) {
        found.push(full.slice(CWD.length + 1))
      }
    }
  }
  walk(CWD, 0)
  return found
}

/**
 * The project's own words, at every length the game plays at. A length the
 * project cannot fill is left out rather than padded, and the chooser falls
 * back to the length it has most of.
 */
function buildPools() {
  const paths = projectFiles().filter(p => isSourceFile(p) || PROSE.test(p))
  const texts = []
  for (const path of paths.slice(0, 400)) {
    try {
      const stat = statSync(join(CWD, path))
      if (stat.size > 400_000) continue
      texts.push(readFileSync(join(CWD, path), 'utf8'))
    } catch { /* a file that moved or cannot be read is simply not vocabulary */ }
  }
  const pools = new Map()
  for (const length of LENGTHS) {
    const pool = poolFor(texts, paths, length)
    if (pool.length >= ENOUGH) pools.set(length, pool)
  }
  if (pools.size === 0) pools.set(DEFAULT_LENGTH, poolFor([], [], DEFAULT_LENGTH))
  return pools
}

// ------------------------------------------------------- what Claude is doing

/**
 * The plugin writes this beside the session; we only read it. One file per
 * working directory, so two projects open at once do not describe each other.
 */
const slug = CWD.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-120)
const STATUS = join(homedir(), '.claude', 'sidequest', `${slug}.json`)
const SAVE = join(homedir(), '.claude', 'sidequest', `${slug}.game.json`)

function readStatus() {
  try {
    const raw = JSON.parse(readFileSync(STATUS, 'utf8'))
    // a status nobody has touched for two minutes is stale: a session that
    // was killed never writes "done", and a game should not claim otherwise
    if (typeof raw.updatedAt === 'number' && Date.now() - raw.updatedAt > 120_000) return undefined
    return raw
  } catch { return undefined }
}

function save(state) {
  try {
    mkdirSync(join(homedir(), '.claude', 'sidequest'), { recursive: true })
    writeFileSync(SAVE, JSON.stringify(state))
  } catch { /* a game that cannot be saved is still a game */ }
}

function load() {
  try { return JSON.parse(readFileSync(SAVE, 'utf8')) } catch { return undefined }
}

// ------------------------------------------------------------------- the state

const pools = buildPools()
const saved = load()

const lengthToPlay = (wanted) => {
  if (pools.has(wanted)) return wanted
  let best = DEFAULT_LENGTH
  let most = -1
  for (const [length, pool] of pools) if (pool.length > most) { most = pool.length; best = length }
  return best
}

const state = {
  game: saved?.game === 'word' ? 'word' : 'board',
  board: saved?.board ?? newBoard(Math.random, saved?.best ?? 0),
  word: saved?.word ?? undefined,
  wanted: saved?.wanted ?? DEFAULT_LENGTH,
  typed: '',
  recent: saved?.recent ?? [],
  note: '',
  /** Where each button landed last draw, so a click can be matched to one. */
  hits: [],
}

function dealWord() {
  const length = lengthToPlay(state.wanted)
  const pool = pools.get(length) ?? poolFor([], [], length)
  const picked = pickFrom(pool, Math.random, state.recent)
  state.word = newGame(picked)
  state.recent = [...state.recent, picked.word].slice(-AVOID)
  state.typed = ''
}

if (!state.word) dealWord()

// ------------------------------------------------------------------ the drawing

const TILE = {
  0: C.grey, 2: C.reset, 4: C.reset, 8: C.yellow, 16: C.yellow, 32: C.red,
  64: C.red, 128: C.magenta, 256: C.magenta, 512: C.cyan, 1024: C.cyan, 2048: C.green,
}

const MARK = { right: C.green, near: C.yellow, absent: C.grey }

/** One row of buttons, remembering where each landed so a click can find it. */
function buttons(row, items) {
  state.hits = state.hits.filter(h => h.row !== row)
  let column = 1
  const parts = []
  for (const [id, label] of items) {
    const text = `[ ${label} ]`
    state.hits.push({ row, from: column, to: column + text.length - 1, id })
    column += text.length + 1
    parts.push(`${C.dim}[${C.reset} ${label} ${C.dim}]${C.reset}`)
  }
  return parts.join(' ')
}

function header() {
  const status = readStatus()
  if (!status) return `${C.grey}Claude Code is not running here${C.reset}`
  if (status.isWorking) {
    const seconds = Math.max(0, Math.round((Date.now() - (status.startedAt ?? Date.now())) / 1000))
    const steps = status.steps ?? 0
    return `${C.cyan}Claude is working${C.reset}${C.dim} · ${steps} step${steps === 1 ? '' : 's'} · ${seconds}s${C.reset}`
  }
  return `${C.green}Claude is done${C.reset}`
}

function drawBoard() {
  const lines = [header(), '']
  const b = state.board
  const top = highest(b.cells)
  lines.push(
    `${C.dim}score${C.reset} ${C.bold}${b.score}${C.reset}` +
    (b.best > 0 ? `${C.dim}  best ${b.best}${C.reset}` : '') +
    (top >= 64 ? `${C.dim}  tile ${top}${C.reset}` : ''),
  )
  lines.push('')
  for (const row of draw(b.cells)) {
    // colour each number by its size without disturbing the grid's spacing
    lines.push(row.replace(/\d+/g, n => `${TILE[Number(n)] ?? C.green}${n}${C.reset}`))
  }
  lines.push('')
  if (b.isOver) lines.push(`${C.red}No moves left.${C.reset} ${C.dim}n deals another board.${C.reset}`)
  const row = lines.length + 1
  lines.push(buttons(row, [['swap', 'Word game'], ['new', 'New board'], ['quit', 'Quit']]))
  lines.push('')
  lines.push(`${C.dim}w a s d or the arrows slide (z q s d too) · n new board · Tab the word game · ctrl+c quit${C.reset}`)
  if (state.note) lines.push(`${C.yellow}${state.note}${C.reset}`)
  return lines.join('\r\n')
}

function drawWord() {
  const game = state.word
  const lines = [header(), '']
  lines.push(`${C.dim}a word from ${game.from}${C.reset}`)
  lines.push('')

  for (const past of game.guesses) {
    const marks = past.length === game.word.length ? grade(past, game.word) : []
    lines.push('  ' + [...past].map((ch, i) => `${MARK[marks[i]] ?? C.reset}${ch.toUpperCase()}${C.reset}`).join(' '))
  }
  if (!game.isDone) {
    const typed = state.typed.padEnd(game.word.length, '_')
    lines.push('  ' + [...typed].map(ch => (ch === '_' ? `${C.grey}_${C.reset}` : `${C.bold}${ch.toUpperCase()}${C.reset}`)).join(' '))
    for (let i = game.guesses.length + 1; i < TRIES; i++) {
      lines.push('  ' + new Array(game.word.length).fill(`${C.grey}_${C.reset}`).join(' '))
    }
  }

  lines.push('')
  if (game.guesses.length > 0) {
    const marks = letterMarks(game)
    const inWord = Object.keys(marks).filter(l => marks[l] !== 'absent').sort()
    const out = Object.keys(marks).filter(l => marks[l] === 'absent').sort()
    lines.push(`${C.dim}in:${C.reset} ${inWord.join(' ') || '—'}   ${C.dim}out:${C.reset} ${C.grey}${out.join(' ') || '—'}${C.reset}`)
  }
  if (game.isDone) {
    lines.push(game.isWon
      ? `${C.green}Got it — ${game.word.toUpperCase()}${C.reset} ${C.dim}(${game.from}) · n for another${C.reset}`
      : `${C.red}It was ${game.word.toUpperCase()}${C.reset} ${C.dim}(${game.from}) · n for another${C.reset}`)
  }
  lines.push('')
  const row = lines.length + 1
  lines.push(buttons(row, [['swap', '2048'], ['new', 'New word'], ['length', `${lengthToPlay(state.wanted)} letters`], ['quit', 'Quit']]))
  lines.push('')
  lines.push(`${C.dim}type the word · enter guesses · backspace deletes · Tab 2048 · ctrl+n new word · ctrl+c quit${C.reset}`)
  if (state.note) lines.push(`${C.yellow}${state.note}${C.reset}`)
  return lines.join('\r\n')
}

const render = () => show(state.game === 'board' ? drawBoard() : drawWord())

// -------------------------------------------------------------------- the acts

const slideBy = (dir) => {
  const next = play(state.board, dir, Math.random)
  state.board = next
  if (next.isOver && !canMove(next.cells)) state.note = ''
}

function act(id) {
  if (id === 'quit') return quit()
  if (id === 'swap') { state.game = state.game === 'board' ? 'word' : 'board'; state.note = '' ; return }
  if (id === 'new') {
    if (state.game === 'board') state.board = newBoard(Math.random, state.board.best)
    else dealWord()
    state.note = ''
    return
  }
  if (id === 'length') {
    const order = [...LENGTHS]
    const at = order.indexOf(lengthToPlay(state.wanted))
    state.wanted = order[(at + 1) % order.length]
    dealWord()
    state.note = pools.has(state.wanted) ? '' : `no ${state.wanted}-letter words here — playing at ${lengthToPlay(state.wanted)}`
  }
}

function submitWord() {
  const text = state.typed.trim().toLowerCase()
  if (state.word.isDone) { dealWord(); return }
  if (text.length !== state.word.word.length) {
    state.note = `${state.word.word.length} letters`
    return
  }
  state.word = applyGuess(state.word, text)
  state.typed = ''
  state.note = ''
}

// -------------------------------------------------------------------- the keys

/**
 * A click lands as `ESC [ < 0 ; col ; row M`. Only a press on a button's own
 * cells counts, which is why every drawn button records where it went.
 */
function onMouse(data) {
  const m = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(data)
  if (!m) return false
  if (m[4] !== 'M' || m[1] !== '0') return true
  const column = Number(m[2])
  const row = Number(m[3])
  const hit = state.hits.find(h => h.row === row && column >= h.from && column <= h.to)
  if (hit) { act(hit.id); render() }
  return true
}

const SLIDES = {
  w: 'up', z: 'up', a: 'left', q: 'left', s: 'down', d: 'right',
  '\x1b[A': 'up', '\x1b[B': 'down', '\x1b[D': 'left', '\x1b[C': 'right',
}

function onKey(data) {
  if (data === '\x03') return quit()
  if (onMouse(data)) return

  // Tab switches, in both games and on every layout: it is not a letter, so
  // the word game's typing never swallows it, and nothing above us wants it.
  if (data === '\t') { act('swap'); return render() }

  if (state.game === 'board') {
    const dir = SLIDES[data]
    if (dir) { slideBy(dir); return render() }
    if (data === 'n' || data === 'r') { act('new'); return render() }
    // `q` is left on an AZERTY board, so it is a slide and never a quit: the
    // only way out is ctrl+c, which no layout argues about
    return
  }

  // the word game: letters are the word, and nothing else is a letter
  if (data === '\r' || data === '\n') { submitWord(); return render() }
  if (data === '\x7f' || data === '\b') { state.typed = state.typed.slice(0, -1); return render() }
  if (data === '\x0e') { act('new'); return render() }
  if (/^[a-zA-Z]$/.test(data)) {
    if (state.typed.length < state.word.word.length) state.typed += data.toLowerCase()
    return render()
  }
}

// -------------------------------------------------------------------- the run

function quit() {
  save({
    game: state.game,
    board: state.board,
    best: state.board.best,
    word: state.word,
    wanted: state.wanted,
    recent: state.recent,
  })
  mouseOff()
  showCursor()
  OUT.write(`${CSI}0m\r\n`)
  process.exit(0)
}

function main() {
  if (!process.stdin.isTTY) {
    OUT.write('sidequest needs a terminal. Run it in a terminal split beside Claude Code.\n')
    process.exit(1)
  }
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', onKey)
  process.on('SIGINT', quit)
  process.on('SIGTERM', quit)
  OUT.on('resize', render)
  hideCursor()
  mouseOn()
  render()
  // the header counts the wait up, and the plugin's file changes under us
  setInterval(render, 1000).unref?.()
}

main()
