import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  AVOID,
  DEFAULT_LENGTH,
  ENOUGH,
  LENGTHS,
  TRIES,
  grade,
  guess,
  letterMarks,
  newGame,
  pickFrom,
  poolFor,
  isSourceFile,
} from './codele'
import { canMove, draw, highest, newBoard, play } from './g2048'
import type { Board, Direction, Grade, WordSource } from '../types'

// One pane per game. The engine shows one and tabs the rest, so switching is
// its control rather than a key of mine.
const PANE_BOARD = 'sidequest-2048'
const PANE_WORD = 'sidequest-word'
const PANES = [PANE_BOARD, PANE_WORD] as const
// What 2048 needs whole: a header, nine rows of board, the button row, two
// rows of keys, the status line and the seat note. Asking for fewer rows than
// the tree draws does not scroll it — the engine stops at the last row and
// the rest is simply not there, which is how the buttons went missing in
// 0.6.0. Inline, a pane is as tall as it asks for, up to what the layout
// spares; docked it is ignored.
const ROWS = 18


const COMMAND = 'sidequest'
const EMPTY_BOARD: Board = { cells: new Array(16).fill(0), score: 0, best: 0, isOver: false }

const isWorking = atom({ plugin: 'sidequest', key: 'isWorking' } as const, false)
const steps = atom({ plugin: 'sidequest', key: 'steps' } as const, 0)
const board = atom({ plugin: 'sidequest', key: 'board' } as const, EMPTY_BOARD, { shape: 'board-1' })
const codele = atom({ plugin: 'sidequest', key: 'codele' } as const, null, { shape: 'codele-1' })
const wanted = atom({ plugin: 'sidequest', key: 'wanted' } as const, String(DEFAULT_LENGTH))
// The terminal has no widget seat, so no engine call minimizes a pane. This
// is the mod drawing one line instead of fourteen, which is what "minimize"
// has to mean where the pane sits above the prompt and pushes the work up.
const isMini = atom({ plugin: 'sidequest', key: 'isMini' } as const, false)

// ---------------------------------------------------------------- the repository

// The file list is read once per load: a reload asks git again, and nothing
// here outlives the session.
let files: string[] | undefined
let root = ''

let tracked: string[] | undefined

/** Whether the pane is seated, so a second open is not asked for. */
let isOpen = false

/** Files that are not source but are full of a project's own words. */
const PROSE = /\.(md|markdown|txt|rst|adoc|ya?ml|twig|html?|sql|toml|ini|cfg|po)$/i

/** Folders never worth walking into: someone else's code, or build output. */
const SKIP = new Set([
  'node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'coverage',
  '.git', '.next', '.venv', 'venv', '__pycache__', '.cache', 'tmp',
])

/**
 * Walks the folder for files, breadth first and bounded, for a project git
 * cannot answer for: one with no repository yet, or one whose files have
 * never been staged. `git ls-files` lists neither, and a new project is
 * exactly where the game would otherwise have nothing of its own to ask.
 */
async function walk($: EngineInterface, max = 400): Promise<string[]> {
  const found: string[] = []
  let level = ['']
  for (let depth = 0; depth < 5 && level.length > 0 && found.length < max; depth++) {
    const next: string[] = []
    for (const dir of level) {
      if (found.length >= max) break
      const entries = await $.fs.list(dir ? `${root}/${dir}` : root).catch(() => [])
      for (const entry of entries) {
        if (entry.isLink || entry.name.startsWith('.')) continue
        const path = dir ? `${dir}/${entry.name}` : entry.name
        if (entry.kind === 'dir') {
          if (!SKIP.has(entry.name)) next.push(path)
        } else if (entry.kind === 'file' && found.length < max) {
          found.push(path)
        }
      }
    }
    level = next
  }
  return found
}

/** Every file of the project, from git where it knows, else from the folder. */
async function trackedFiles($: EngineInterface): Promise<string[]> {
  if (tracked) return tracked
  const ran = await $.process
    .run(['git', '-C', root, 'ls-files'], { timeoutMs: 10000 })
    .catch(() => undefined)
  const listed =
    ran && ran.exitCode === 0 ? ran.stdout.split('\n').map(l => l.trim()).filter(Boolean) : []
  return (tracked = listed.length > 0 ? listed : await walk($))
}

async function sourceFiles($: EngineInterface): Promise<string[]> {
  if (files) return files
  return (files = (await trackedFiles($)).filter(isSourceFile))
}

/** Reads one file of the repository, by its path relative to the root. */
async function readFile($: EngineInterface, path: string): Promise<string | undefined> {
  const text = await $.fs.read(`${root}/${path}`).catch(() => undefined)
  // a file too large is a slow read and a poor puzzle either way
  return text && text.length < 200_000 ? text : undefined
}

const roll = () => Math.random()

/** Starts a board, keeping the best score the player already has. */
async function reset($: EngineInterface): Promise<void> {
  const had = await read($, board)
  await update($, board, () => newBoard(roll, had.best))
}

// One pool per word length, gathered once per load: reading the repository
// is the slow part, and its vocabulary does not change inside a session.
let pools: Map<number, WordSource[]> | undefined

/**
 * Everything the project has written, as the word pool: its source, its
 * markdown, and its commit messages. A curated list would run out; this is as
 * large as the repository and grows with it.
 */
async function wordPools($: EngineInterface): Promise<Map<number, WordSource[]>> {
  if (pools) return pools
  const all = await sourceFiles($)
  const docs = await trackedFiles($)
  const texts: string[] = []

  // Code is not the only place a project writes its own words: its templates,
  // its configuration and its documentation carry the vocabulary of the
  // domain, which the source often only abbreviates.
  const prose = docs.filter(p => PROSE.test(p)).slice(0, 30)
  for (const path of [...all.slice(0, 60), ...prose]) {
    const text = await readFile($, path)
    if (text) texts.push(text)
  }
  // what the project says about itself, in its own commit messages
  const log = await $.process
    .run(['git', '-C', root, 'log', '--format=%s%n%b', '-n', '500'], { timeoutMs: 10000 })
    .catch(() => undefined)
  if (log && log.exitCode === 0) texts.push(log.stdout)

  const built = new Map<number, WordSource[]>()
  for (const length of LENGTHS) built.set(length, poolFor(texts, all, length))
  return (pools = built)
}

/**
 * The length to play at: the one asked for where the project has the words
 * for it, else whichever length it has most of. A repository that says little
 * at six letters should not leave the game unplayable.
 */
function lengthToPlay(built: Map<number, WordSource[]>, wanted: string): number {
  const sizes = [...built.entries()]
  const best = sizes.reduce((a, b) => (b[1].length > a[1].length ? b : a), sizes[0] as [number, WordSource[]])
  if (wanted === 'mixed') {
    const rich = sizes.filter(([, words]) => words.length >= ENOUGH)
    const choice = rich.length > 0 ? rich[Math.floor(roll() * rich.length) % rich.length] : undefined
    return choice ? choice[0] : best[0]
  }
  const asked = Number(wanted) || DEFAULT_LENGTH
  const got = built.get(asked)
  return got && got.length >= ENOUGH ? asked : best[0]
}

/** Starts a word game on a word the last sixty games have not used. */
async function newWord($: EngineInterface, wanted: string): Promise<void> {
  const built = await wordPools($)
  const words = built.get(lengthToPlay(built, wanted)) ?? []
  const recent = (await $.store.get('recent').catch(() => undefined)) as string[] | undefined
  const avoid = Array.isArray(recent) ? recent : []
  const picked = pickFrom(words, roll, avoid)
  await $.store.set('recent', [...avoid, picked.word].slice(-AVOID)).catch(() => undefined)
  await update($, codele, () => newGame(picked))
}

/** Takes a guess, starting a new word once the last one is finished. */
/**
 * What the word game's field does with a line.
 *
 * The field is the only surface this game has, so it carries the controls as
 * well as the guesses. No key is bound in this pane and none can be: every
 * letter belongs to the word being spelled, and a digit needs shift on an
 * AZERTY board. A typed word costs an Enter that was going to be pressed
 * anyway.
 */
async function sayWord($: EngineInterface, text: string, length: string): Promise<void> {
  const said = text.trim().toLowerCase()

  // the way back to the board, typed rather than pressed: every letter here
  // belongs to the word being spelled, so no key of this pane can mean it
  if (/^(2048|board|back|game)$/.test(said)) return swapTo($, PANE_BOARD)
  // the field is this game's only control surface, so "minimize" is a word
  // typed into it like any other
  if (/^(m|min|mini|minimize|hide)$/.test(said)) return toggleMini($)
  if (said === 'new') return newWord($, length)
  if (/^(4|5|6|7|mixed)$/.test(said)) {
    await update($, wanted, () => said)
    await $.store.set('wanted', said).catch(() => undefined)
    return newWord($, said)
  }

  const game = await read($, codele)
  if (!game) return newWord($, length)
  if (game.isDone) return newWord($, length)
  if (said === '') return
  await update($, codele, g => (g ? guess(g, said) : g))
}

/**
 * How a graded letter is drawn. The colour is the letter's own, not a block
 * painted behind it: a terminal draws a foreground colour everywhere, while a
 * `backgroundColor` it does not paint leaves every letter looking alike, which
 * is a graded guess that says nothing.
 *
 * The mark under each letter carries the same grade without colour at all, for
 * a terminal with none and for anyone who cannot tell these two hues apart.
 */
const TILE: Record<Grade, { color: string; bold?: true; dimColor?: true }> = {
  right: { color: 'text-success', bold: true },
  near: { color: 'text-warning', bold: true },
  absent: { color: 'text-muted', dimColor: true },
}

/**
 * The mark each letter carries: `=` in place, `~` elsewhere in the word, `·`
 * not in it. It rides on the letter rather than on a row of its own, so a
 * guess is one row and reads without colour — a terminal is free to draw two
 * theme hues so alike that green and amber cannot be told apart, and then the
 * colour alone says nothing.
 */
const MARK: Record<Grade, string> = { right: '=', near: '~', absent: '·' }

/** One move, and the best score written through to the store when it grows. */
async function slideBoard($: EngineInterface, dir: Direction): Promise<void> {
  const had = await read($, board)
  if (had.isOver) return reset($)
  const next = play(had, dir, roll)
  if (next === had) return
  await update($, board, () => next)
  if (next.best > had.best) await $.store.set('best', next.best).catch(() => undefined)
}

/**
 * The one thing the command does: put the two panes on screen, or take them
 * away. Everything else is played in them, because a game you play by typing
 * a command per move is not a game.
 */
/**
 * Swaps the pane that is up for the other game's, keeping the keyboard.
 *
 * Opening an id that is already open only delivers a title; it does not raise
 * the pane. Raising needs `focus`, and focus is granted only while the prompt
 * holds the keys over an empty composer — which is never true while you are
 * playing in a pane. Closing the one you are in *is* what hands the keys back,
 * so the open that follows is eligible for it, and you carry on playing in the
 * other game without touching the prompt. Measured on a real session: `g` in
 * 2048 reaches the word game with the keyboard still in the pane.
 *
 * It also means one pane is up at a time, so the title names the game.
 */
async function swapTo($: EngineInterface, id: string): Promise<void> {
  const other = id === PANE_BOARD ? PANE_WORD : PANE_BOARD
  await $.ui.close({ id: other }).catch(() => undefined)
  await $.ui.open({
    id,
    title: id === PANE_BOARD ? '2048' : 'Word',
    rows: ROWS,
    focus: true,
  }).catch(() => undefined)
}

/**
 * Shuts whichever game is up. The engine's own mark does this too; this is
 * the same thing under a pointer, for the person who would rather click.
 */
/**
 * Why the pane is where it is, when it is not where a person expects.
 *
 * Two rules of the engine's decide it, and neither is visible from inside the
 * game: a pane docks beside the transcript only under the fullscreen layout
 * and only from 110 columns, and a click is reported only under that same
 * layout. Someone whose pane sits above the prompt and whose buttons do
 * nothing is seeing both rules at once, with nothing on screen to say so.
 */
function seatNote(placement: string, columns?: number, isFullscreen?: boolean): string | undefined {
  if (placement === 'dock') return undefined
  if (isFullscreen === false) {
    // Measured: on the main screen the engine never turns mouse reporting on
    // (every ?1000/1002/1003/1006 in the stream is a disable), so no click
    // can reach a button. Setting CLAUDE_CODE_NO_FLICKER=1 turns the
    // fullscreen layout on, and with it both the reporting and the seat
    // beside the transcript.
    return 'Main screen, not fullscreen: no click can reach these buttons, and the pane cannot sit beside the transcript. Set CLAUDE_CODE_NO_FLICKER=1 in ~/.claude/settings.json under "env" to change both. The keys work either way.'
  }
  if (typeof columns === 'number' && columns < 110) {
    return `Above the prompt: the terminal is ${columns} columns. At 110 it docks beside the transcript instead, and the buttons answer a click.`
  }
  return 'Above the prompt rather than beside the transcript. m rolls this up to one line.'
}

/** Rolls the pane up to one line, or back down. */
async function toggleMini($: EngineInterface): Promise<void> {
  await update($, isMini, on => !on)
}

async function closeAll($: EngineInterface): Promise<void> {
  isOpen = false
  for (const id of PANES) await $.ui.close({ id }).catch(() => undefined)
}

async function openPanes($: EngineInterface, front: string): Promise<boolean> {
  // One game is up at a time, so the pane's title says which, and `g` or a
  // typed `2048` swaps it. 2048 is the default because it is the one that can
  // be played without reading anything first.
  const id = front === 'codele' ? PANE_WORD : PANE_BOARD
  const opened = await $.ui.open({
    id,
    title: id === PANE_BOARD ? '2048' : 'Word',
    rows: ROWS,
  })
  if (!(await read($, codele))) await newWord($, await read($, wanted))
  return Boolean(opened.isPlaced)
}

export const register: Register = (on, options) => {
  const configured = String(options.mode ?? '2048')
  const configuredLength = String(options.word_length ?? String(DEFAULT_LENGTH))
  const after = Number(options.after_seconds ?? 20)

  let startedAt = 0
  // an unasked pane is seated only from 144 columns, and 110 once the person
  // has asked for it once; below that it waits undrawn, which looks from the
  // outside exactly like a plugin that does nothing. Say so, once.
  let hasSaidNarrow = false

  on('session.start', async ($, e, next) => {
    root = e.cwd
    await $.command.register({
      name: COMMAND,
      description: 'Open 2048 and a word game built from this project, beside the chat',
    })
    const kept = Number(await $.store.get('best').catch(() => 0)) || 0
    await update($, board, () => newBoard(roll, kept))
    // the length last chosen from the pane outlives the session; the setting
    // is what a machine that has never chosen one plays at
    const chosen = String((await $.store.get('wanted').catch(() => undefined)) ?? configuredLength)
    const length = [...LENGTHS.map(String), 'mixed'].includes(chosen) ? chosen : configuredLength
    await update($, wanted, () => length)
    if (configured === 'codele') await newWord($, length)
    return next(e)
  })

  /**
   * Everything the games need, driven from the prompt.
   *
   * Reaching into the pane means taking the keyboard from the composer, and
   * that turns out to be the one thing neither the plugin nor the person can
   * rely on: the chord is refused over a composer holding text, it lapses if
   * the two presses are not quick, and a terminal reports no click outside
   * its fullscreen layout. A slash command is answered every time, whatever
   * holds the keyboard and whatever the keyboard is laid out like.
   */

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (/^(close|quit)$/.test(e.args.trim().toLowerCase())) {
      isOpen = false
      for (const id of PANES) await $.ui.close({ id })
      return { text: 'Sidequest closed. /sidequest opens it again, where you left off.' }
    }
    // A hotkey presses only while the pane holds the keyboard — never from the
    // composer — so once the game is rolled up there is no key that opens it
    // again. This is the way back, and it is why the rolled-up line says so.
    await update($, isMini, () => false)
    isOpen = await openPanes($, configured)
    return {
      text:
        'Sidequest is open. It follows the wait: the game opens by itself once a turn has run a ' +
        'while, and rolls up to one line the moment Claude is done — your board, score and word all ' +
        'kept, and the next wait rolls it down again where you left it.\n\n' +
        'To open it yourself while it is rolled up: ctrl+x then tab to take the keyboard, then m. ' +
        'Or run /sidequest again. A hotkey cannot reach a pane from the prompt, so m alone will not do it.\n\n' +
        'Press ctrl+x then tab — quickly, one after the other — to take the keyboard. ' +
        'In 2048: w a s d slide (z q s d too), r deals a new board, g goes to the word game, m rolls it up. ' +
        'In the word game: type the word and press enter, type 2048 to come back, or min to roll it up. ' +
        'Esc returns the prompt — and if Esc only moves your cursor into the editor, that is your IDE ' +
        'taking the key first: Settings, Tools, Terminal, turn off "Move focus to the editor with Escape".',
    }
  }).catch(($, e, next) => ({
    text: `sidequest could not open: ${next.error.message ?? 'unknown error'}`,
  }))

  // The game follows the wait. A turn starting rolls it back down — there is
  // something to play through now — and a turn ending rolls it up, because
  // the thing it was filling is over and the screen belongs to the answer
  // again. The pane is never closed by either: a rolled-up game keeps its
  // board, its score and its word, and `m` has it back in one key.
  on('turn.start', async ($, e, next) => {
    startedAt = await $.clock.now()
    await update($, steps, () => 0)
    await update($, isWorking, () => true)
    await update($, isMini, () => false)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, isWorking, () => false)
    await update($, isMini, () => true)
    return next(e)
  })

  // Nothing is timed: every tool call asks how long the turn has run, so a
  // long one opens the pane without a timer outliving its dispatch.
  on('tool.call', async ($, e, next) => {
    await update($, steps, n => n + 1)
    if (after > 0 && !isOpen && startedAt > 0) {
      const seconds = ((await $.clock.now()) - startedAt) / 1000
      if (seconds >= after) {
        // No `focus`, here or anywhere. A focus request is granted only over
        // an empty composer, and a refused one does not merely fail: measured
        // on a real session, the ctrl+x tab chord stops working after it, so
        // the keys meant for the game land in the composer and an Enter among
        // them sends them to the model. Asking and losing is worse than never
        // asking, so the keyboard is only ever taken by the person.
        const front = await $.ui.open({ id: PANE_BOARD, title: '2048', rows: ROWS })
        isOpen = front.isPlaced
        if (!front.isPlaced && !hasSaidNarrow) {
          hasSaidNarrow = true
          // the engine says why it kept the seat; a width is the usual reason
          $.ui.toast(`sidequest did not open by itself (${front.reason}). Run /sidequest to play at any width.`)
        }
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Two panes, not one with a switch key. The engine draws a pane per id and
  // puts the rest in tabs of its own, which the person moves between with a
  // click or Tab and Enter. That is a control the engine owns on every
  // layout, so there is no switch key of mine to collide with a typed letter,
  // to need shift on an AZERTY board, or to sit one key from closing the pane.
  on('ui.render', { component: 'Pane', requestId: PANE_BOARD }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    // say why the pane is above the prompt and why a click does nothing: both
    // are rules of the engine's, and neither shows from inside the game
    const seat = seatNote(e.props.placement, e.viewport?.columns, e.viewport?.isFullscreen)
    // the room the body actually has; a pane that asked for more than the
    // layout could spare still has to draw inside what it was given
    const room = e.props.scroll?.bodyRows ?? ROWS
    const hasSpareRow = room >= ROWS
    const working = await read($, isWorking)
    const n = await read($, steps)
    // the header doubles as the progress line, so a player need not leave the
    // game to see whether the turn they are waiting on is still running
    const header = working ? `Claude is working · ${n} step${n === 1 ? '' : 's'}` : 'Claude is done'

      const b = await read($, board)
      const top = highest(b.cells)
      const onSlide = (dir: Direction) => () => void slideBoard($, dir)

      // Rolled up: one line, so the pane stops pushing the transcript up on a
      // terminal too narrow to seat it beside one. Nothing is typed in this
      // form, so `m` is free to open it again on either game.
      if (await read($, isMini)) {
        return (
          <Box>
            <Button
              key="unmini"
              hotkey="m"
              plain
              label={`▸ 2048 · score ${b.score} · ctrl+x tab then m, or /sidequest`}
              onPress={() => void toggleMini($)}
            />
            <Text> </Text>
            <Button key="click-open" variant="secondary" label="Open" onPress={() => void toggleMini($)} />
            <Text> </Text>
            <Button key="click-close" role="dismiss" label="Close" onPress={() => void closeAll($)} />
          </Box>
        )
      }

      return (
        <Box flexDirection="column">
          <Text dimColor>
            {`${header} · score ${b.score}`}
            {b.best > 0 ? ` · best ${b.best}` : ''}
            {top >= 64 ? ` · tile ${top}` : ''}
          </Text>
          {draw(b.cells).map((row, i) => (
            <Box key={`row-${i}`}>
              <Text>{row}</Text>
            </Box>
          ))}
          {b.isOver && <Text color="text-danger">No moves left. Press r, or click New board.</Text>}
          {/*
            The buttons come first, directly under the board, because they are
            the only controls a pointer can reach and because anything below
            the pane's last row is not drawn at all. That is how they went
            missing: the tree was longer than the rows the pane asked for, and
            the engine simply stopped drawing. Nothing here may be ordered by
            how interesting it is; it is ordered by what must survive a short
            pane, most important first.

            None of them carries a key except Minimize. A hotkey is a key
            taken out of the terminal's mouth — that is what closed the pane
            from shift+2 and from the numeric keypad — and a button with no
            hotkey cannot be pressed by accident. `m` is safe here only
            because this game types nothing.
          */}
          <Box key="controls">
            <Button
              key="click-swap"
              variant="secondary"
              label="Word game"
              onPress={() => void swapTo($, PANE_WORD)}
            />
            <Text> </Text>
            <Button key="click-new" variant="secondary" label="New board" onPress={() => void reset($)} />
            <Text> </Text>
            <Button
              key="click-mini"
              hotkey="m"
              variant="secondary"
              label="Minimize"
              onPress={() => void toggleMini($)}
            />
            <Text> </Text>
            <Button key="click-close" role="dismiss" label="Close" onPress={() => void closeAll($)} />
          </Box>
          {/*
            Letters, never digits. A digit needs shift on an AZERTY board, so
            `shift+2` — and the numeric keypad — arrive as a plain `2`, which
            is a key nobody meant to press. A letter is the same key on every
            layout, and nothing is typed in this game, so none of them collide.
          */}
          <Box>
            <Button key="up" hotkey="w" plain label="up" onPress={onSlide('up')} />
            <Text> </Text>
            <Button key="left" hotkey="a" plain label="left" onPress={onSlide('left')} />
            <Text> </Text>
            <Button key="down" hotkey="s" plain label="down" onPress={onSlide('down')} />
            <Text> </Text>
            <Button key="right" hotkey="d" plain label="right" onPress={onSlide('right')} />
            <Text> </Text>
            <Button key="new" hotkey="r" plain dimColor label="new" onPress={() => void reset($)} />
            <Text> </Text>
            <Button key="swap" hotkey="g" plain dimColor label="word game" onPress={() => void swapTo($, PANE_WORD)} />
          </Box>
          {/*
            W-A-S-D is a shape on a QWERTY board, not a set of letters: under
            the same four fingers an AZERTY board reads Z-Q-S-D. The first
            thing to go when the room is short.
          */}
          <Box key="azerty" display={hasSpareRow ? 'flex' : 'none'}>
            <Button key="up-az" hotkey="z" plain dimColor label="azerty z" onPress={onSlide('up')} />
            <Text> </Text>
            <Button key="left-az" hotkey="q" plain dimColor label="q" onPress={onSlide('left')} />
          </Box>
          <Text color={e.props.isFocused ? 'text-success' : undefined} dimColor={!e.props.isFocused}>
            {e.props.isFocused
              ? 'Playing — w a s d slide · m minimize · g word game · Tab+Enter for the buttons'
              : 'ctrl+x then tab, quickly, then w a s d'}
          </Text>
          {seat && hasSpareRow && <Text dimColor>{seat}</Text>}
        </Box>
      )
  })

  on('ui.render', { component: 'Pane', requestId: PANE_WORD }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
    // say why the pane is above the prompt and why a click does nothing: both
    // are rules of the engine's, and neither shows from inside the game
    const seat = seatNote(e.props.placement, e.viewport?.columns, e.viewport?.isFullscreen)
    // the room the body actually has; a pane that asked for more than the
    // layout could spare still has to draw inside what it was given
    const room = e.props.scroll?.bodyRows ?? ROWS
    const hasSpareRow = room >= ROWS
    const working = await read($, isWorking)
    const n = await read($, steps)
    // the header doubles as the progress line, so a player need not leave the
    // game to see whether the turn they are waiting on is still running
    const header = working ? `Claude is working · ${n} step${n === 1 ? '' : 's'}` : 'Claude is done'

    const onCycleLength = () => {
      void (async () => {
        const order = [...LENGTHS.map(String), 'mixed']
        const at = order.indexOf(await read($, wanted))
        const next = order[(at + 1) % order.length] ?? String(DEFAULT_LENGTH)
        await update($, wanted, () => next)
        await $.store.set('wanted', next).catch(() => undefined)
        await newWord($, next)
      })()
    }

      const letters = await read($, wanted)
      const word = await read($, codele)

      // The same one line. Collapsed there is no field, so no letter is being
      // typed, and `m` can open it again here too.
      if (await read($, isMini)) {
        return (
          <Box>
            <Button
              key="unmini"
              hotkey="m"
              plain
              label={`▸ Word · ${word ? `${word.guesses.length}/${TRIES}` : 'dealing'} · ctrl+x tab then m, or /sidequest`}
              onPress={() => void toggleMini($)}
            />
            <Text> </Text>
            <Button key="click-open" variant="secondary" label="Open" onPress={() => void toggleMini($)} />
            <Text> </Text>
            <Button key="click-close" role="dismiss" label="Close" onPress={() => void closeAll($)} />
          </Box>
        )
      }
      if (!word) {
        return (
          <Box flexDirection="column">
            <Text dimColor>{header}</Text>
            <Text dimColor>Finding a word from your code…</Text>
          </Box>
        )
      }
      const marks = letterMarks(word)
      const rows: Grade[][] = word.guesses.map(g => grade(g, word.word))
      // header, the six guess rows, the in/out line, the field, the controls
      // and the line saying how to reach the pane

      return (
        <Box flexDirection="column">
          <Text dimColor>
            {`${header} · guess ${Math.min(word.guesses.length + 1, TRIES)} of ${TRIES} · A= in place, A~ elsewhere`}
          </Text>
          {word.guesses.map((g, row) => (
            <Box key={`guess-${row}`}>
              {Array.from({ length: word.length }, (_, i) => i).map(i => {
                const mark = (rows[row] ?? [])[i] ?? 'absent'
                return (
                  <Text color={TILE[mark].color} bold={TILE[mark].bold} dimColor={TILE[mark].dimColor}>
                    {`${(g[i] ?? ' ').toUpperCase()}${MARK[mark]} `}
                  </Text>
                )
              })}
            </Box>
          ))}
          {Array.from(
            { length: Math.max(0, Math.min(TRIES - word.guesses.length, room - 6 - word.guesses.length)) },
            (_, i) => i,
          ).map(i => (
            <Box key={`empty-${i}`}>
              <Text dimColor>{'_  '.repeat(word.length)}</Text>
            </Box>
          ))}
          {word.isDone ? (
            <Text color={word.isWon ? 'text-success' : 'text-danger'}>
              {word.isWon
                ? `Solved in ${word.guesses.length}. ${word.word.toUpperCase()} is ${word.from} jargon.`
                : `It was ${word.word.toUpperCase()} — ${word.from} jargon.`}
            </Text>
          ) : (
            <Box>
              {/*
                A letter ruled out is struck through, not merely dimmed: a
                terminal is free to draw `dim` as any shade it likes, and where
                that shade is warmer than the plain text the eliminated letters
                are the ones that catch the eye, which is backwards.
              */}
              {'abcdefghijklmnopqrstuvwxyz'.split('').map(letter => (
                <Text
                  bold={marks[letter] === 'right' || marks[letter] === 'near'}
                  dimColor={marks[letter] === 'absent'}
                  strikethrough={marks[letter] === 'absent'}
                  color={
                    marks[letter] === 'right'
                      ? 'text-success'
                      : marks[letter] === 'near'
                        ? 'text-warning'
                        : marks[letter] === 'absent'
                          ? 'text-muted'
                          : undefined
                  }
                >
                  {letter}
                </Text>
              ))}
            </Box>
          )}
          {word.guesses.length > 0 && (
            <Text dimColor>
              {(() => {
                const known = Object.keys(marks).filter(l => marks[l] !== 'absent').sort()
                const out = Object.keys(marks).filter(l => marks[l] === 'absent').sort()
                return `in: ${known.join(' ') || '—'}   out: ${out.join(' ') || '—'}`
              })()}
            </Text>
          )}
          {/*
            Every letter here is typed into the field, so a letter cannot also
            be a control: pressing `g` to spell a word must not swap the game
            out from under it. Digits are no good either — shift on AZERTY.

            So nothing is bound, and the field takes the controls instead. A
            word of the right length is a guess; `2048`, `new`, `4`..`7` and
            `mixed` are what they say. One surface, no collisions, no layout.
          */}
          <Input
            key="guess"
            autoFocus
            placeholder={word.isDone ? 'enter for another word' : `${word.length} letters — or 2048 to go back`}
            onSubmit={(value: string) => void sayWord($, value, letters)}
          />
          {/*
            Not one of these carries a hotkey, and that is the point. A hotkey
            here is a key taken out of the terminal's mouth: on an AZERTY
            board a digit needs shift, so `2` — which used to mean close —
            fired from shift+2 and from the numeric keypad, and the game shut
            itself while its owner was trying to switch to the other one. The
            buttons stay because a click still works in a fullscreen terminal;
            the keyboard is never touched.
          */}
          <Box key="controls">
            <Button
              key="length"
              plain
              dimColor
              label={letters === 'mixed' ? 'mixed length' : `${letters} letters`}
              onPress={onCycleLength}
            />
            <Text> </Text>
            <Button
              key="click-swap"
              variant="secondary"
              label="2048"
              onPress={() => void swapTo($, PANE_BOARD)}
            />
            <Text> </Text>
            <Button
              key="click-new"
              variant="secondary"
              label="New word"
              onPress={() => void newWord($, letters)}
            />
            <Text> </Text>
            <Button key="click-mini" variant="secondary" label="Minimize" onPress={() => void toggleMini($)} />
            <Text> </Text>
            <Button key="click-close" role="dismiss" label="Close" onPress={() => void closeAll($)} />
          </Box>
          {seat && hasSpareRow && <Text dimColor>{seat}</Text>}
          <Text color={e.props.isFocused ? 'text-success' : undefined} dimColor={!e.props.isFocused}>
            {e.props.isFocused
              ? 'Typing here — or Tab to the buttons and Enter. Type 2048 for the board, m to roll up'
              : 'ctrl+x then tab, quickly, then type the word'}
          </Text>
        </Box>
      )
  })
}
