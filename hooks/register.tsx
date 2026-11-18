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

const PANE = 'sidequest'
// What 2048 needs whole: a header, nine rows of board, two rows of keys and
// the line saying how to reach the pane. Inline, a pane is as tall as it asks
// for, up to what the layout spares; docked it is ignored.
const ROWS = 14

/** What a slash argument means, for 2048. */
const SAID: Record<string, Direction> = {
  w: 'up', z: 'up', up: 'up',
  s: 'down', down: 'down',
  a: 'left', q: 'left', left: 'left',
  d: 'right', right: 'right',
}

const USAGE =
  'Play from the prompt: /sq w a s d slides (a run like /sq ddss slides four times), /sq <word> guesses, ' +
  '/sq 2048 and /sq word pick a game, /sq next swaps, /sq new deals again, /sq 4..7 or mixed sets the length, ' +
  '/sq close. The keyboard never leaves the prompt, on any layout.'
const COMMAND = 'sidequest'
// The same command under a name short enough to play with: a slide costs
// five keystrokes instead of twelve, which is the difference between a game
// and a chore.
const ALIAS = 'sq'
const EMPTY_BOARD: Board = { cells: new Array(16).fill(0), score: 0, best: 0, isOver: false }
const KEYS: Record<string, Direction> = { w: 'up', s: 'down', a: 'left', d: 'right' }

const isWorking = atom({ plugin: 'sidequest', key: 'isWorking' } as const, false)
const steps = atom({ plugin: 'sidequest', key: 'steps' } as const, 0)
const board = atom({ plugin: 'sidequest', key: 'board' } as const, EMPTY_BOARD, { shape: 'board-1' })
const codele = atom({ plugin: 'sidequest', key: 'codele' } as const, null, { shape: 'codele-1' })
const showing = atom({ plugin: 'sidequest', key: 'showing' } as const, 'board')
const wanted = atom({ plugin: 'sidequest', key: 'wanted' } as const, String(DEFAULT_LENGTH))

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
async function sayWord($: EngineInterface, text: string, wanted: string): Promise<void> {
  const game = await read($, codele)
  if (!game) return newWord($, wanted)
  if (game.isDone) return newWord($, wanted)
  await update($, codele, g => (g ? guess(g, text) : g))
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
 * Everything either game can be told, answered from the prompt.
 *
 * Declared here rather than inside `register` because a function handed
 * the engine interface has to be one the module can name.
 */
async function respond($: EngineInterface, e: { args: string }) {
  const said = e.args.trim().toLowerCase()

  if (said !== '') {
    await $.ui.open({ id: PANE, title: 'Sidequest', rows: ROWS })
    isOpen = true

    if (said === 'close' || said === 'quit') {
      isOpen = false
      await $.ui.close({ id: PANE })
      return { text: 'Sidequest closed. /sq opens it again, where you left off.' }
    }
    // `2048` and `word` name a game outright rather than toggling, so
    // there is no state to lose track of: whichever is showing, either one
    // gets you to the one you asked for.
    if (said === '2048' || said === 'board' || (said === 'next' && (await read($, showing)) === 'codele')) {
      await update($, showing, () => 'board')
      return { text: 'Playing 2048. /sq w, a, s or d slides, /sq ddss slides four times, /sq word goes to the word game.' }
    }
    if (said === 'word' || said === 'codele' || said === 'next') {
      await update($, showing, () => 'codele')
      if (!(await read($, codele))) await newWord($, await read($, wanted))
      return { text: 'Playing the word game. /sq <word> guesses, /sq 2048 goes back.' }
    }
    if (said === 'new') {
      if ((await read($, showing)) === 'board') {
        await reset($)
        return { text: 'A new board.' }
      }
      await newWord($, await read($, wanted))
      return { text: 'A new word.' }
    }
    if (/^(4|5|6|7|mixed)$/.test(said)) {
      await update($, wanted, () => said)
      await $.store.set('wanted', said).catch(() => undefined)
      await update($, showing, () => 'codele')
      await newWord($, said)
      return { text: `The word game now asks for ${said === 'mixed' ? 'a varying number of' : said} letters.` }
    }

    const slide = SAID[said]
    if (slide) {
      await update($, showing, () => 'board')
      await slideBoard($, slide)
      const now = await read($, board)
      return { text: `Slid ${slide}. Score ${now.score}${now.isOver ? ' — no moves left, /sq new deals another board.' : '.'}` }
    }

    // A run of moves, so the board can be played in bursts rather than one
    // round trip per slide. Only while the board is showing: in the word
    // game the same letters are a guess.
    if ((await read($, showing)) === 'board' && /^[wasdzq]+$/.test(said)) {
      const runs = said.split('').map(c => SAID[c]).filter(Boolean) as Direction[]
      for (const dir of runs) await slideBoard($, dir)
      const now = await read($, board)
      return {
        text: `Slid ${runs.join(', ')}. Score ${now.score}${now.isOver ? ' — no moves left, /sq new deals another board.' : '.'}`,
      }
    }

    if (/^[a-z]+$/.test(said)) {
      await update($, showing, () => 'codele')
      const game = (await read($, codele)) ?? (await newWord($, await read($, wanted)), await read($, codele))
      if (!game) return { text: 'No word to guess yet. /sq word deals one.' }
      if (said.length !== game.word.length) {
        return { text: `That word is ${said.length} letters; this one wants ${game.word.length}. /sq ${game.word.length} changes the length.` }
      }
      await sayWord($, said, await read($, wanted))
      const after = await read($, codele)
      if (!after) return { text: 'The guess did not land.' }
      if (after.isDone) {
        return {
          text: after.isWon
            ? `${after.word.toUpperCase()} — solved in ${after.guesses.length}. It is ${after.from} jargon. /sq new deals another.`
            : `Out of guesses. It was ${after.word.toUpperCase()}, ${after.from} jargon. /sq new deals another.`,
        }
      }
      return { text: `${grade(said, after.word).map((m, i) => `${said[i]?.toUpperCase()}${MARK[m]}`).join(' ')} — guess ${after.guesses.length + 1} of ${TRIES}.` }
    }

    return { text: `Sidequest does not know "${said}". ${USAGE}` }
  }

  // No `focus`. The pane asking for the keyboard is what made this
  // unpredictable: the request is granted only over an empty composer, so
  // whether the next keystroke went to the game or to the prompt depended on
  // something invisible. The keyboard now always belongs to the prompt.
  await $.ui.open({ id: PANE, title: 'Sidequest', rows: ROWS })
  isOpen = true
  return { text: `Sidequest is open. ${USAGE}` }
}

export const register: Register = (on, options) => {
  const configured = String(options.mode ?? '2048')
  const configuredLength = String(options.word_length ?? String(DEFAULT_LENGTH))
  const isGame = configured === '2048' || configured === 'codele'
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
      description: 'Open 2048, or a word game built from this project, beside the chat',
    })
    await $.command.register({
      name: ALIAS,
      description: 'Sidequest, short: /sq w a s d slides, /sq <word> guesses, /sq next swaps game',
    }).catch(() => undefined)
    const kept = Number(await $.store.get('best').catch(() => 0)) || 0
    await update($, board, () => newBoard(roll, kept))
    await update($, showing, () => (configured === 'codele' ? 'codele' : 'board'))
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

  on('command.run', { command: COMMAND }, async ($, e) => respond($, e)).catch(($, e, next) => ({
    text: `sidequest could not open: ${next.error.message ?? 'unknown error'}`,
  }))

  on('command.run', { command: ALIAS }, async ($, e) => respond($, e)).catch(($, e, next) => ({
    text: `sidequest could not open: ${next.error.message ?? 'unknown error'}`,
  }))

  on('turn.start', async ($, e, next) => {
    startedAt = await $.clock.now()
    await update($, steps, () => 0)
    await update($, isWorking, () => true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, isWorking, () => false)
    return next(e)
  })

  // Nothing is timed: every tool call asks how long the turn has run, so a
  // long one opens the pane without a timer outliving its dispatch.
  on('tool.call', async ($, e, next) => {
    await update($, steps, n => n + 1)
    if (after > 0 && !isOpen && startedAt > 0) {
      const seconds = ((await $.clock.now()) - startedAt) / 1000
      if (seconds >= after) {
        // no `focus`: the keyboard stays with the prompt until Tab is pressed,
        // so an unasked pane never swallows what is being typed
        const opened = await $.ui.open({ id: PANE, title: 'Sidequest', rows: ROWS })
        isOpen = opened.isPlaced
        if (!opened.isPlaced && !hasSaidNarrow) {
          hasSaidNarrow = true
          // the engine says why it kept the seat; a width is the usual reason
          $.ui.toast(`sidequest did not open by itself (${opened.reason}). Run /sidequest to play at any width.`)
        }
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Text } = $.ui.resolve(e)
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
    const onSwitch = () => {
      void (async () => {
        const now = await read($, showing)
        const next = now === 'board' ? 'codele' : 'board'
        await update($, showing, () => next)
        if (next === 'codele' && !(await read($, codele))) await newWord($, await read($, wanted))
      })()
    }
    const onClose = () => {
      isOpen = false
      void $.ui.close({ id: PANE })
    }

    if ((await read($, showing)) === 'codele') {
      const letters = await read($, wanted)
      const word = await read($, codele)
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
          <Input
            key="guess"
            autoFocus
            placeholder={word.isDone ? 'enter for another word' : `${word.length} letters, then enter`}
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
          <Box>
            <Button key="swap" plain dimColor label="2048" onPress={onSwitch} />
            <Text> </Text>
            <Button key="close" plain dimColor label="close" onPress={onClose} />
            <Text> </Text>
            <Button
              key="length"
              plain
              dimColor
              label={letters === 'mixed' ? 'mixed length' : `${letters} letters`}
              onPress={onCycleLength}
            />
          </Box>
          <Text dimColor>/sq {'<word>'} guesses · /sq 2048 · /sq new · /sq close</Text>
        </Box>
      )
    }

    {
      const b = await read($, board)
      const top = highest(b.cells)
      const onSlide = (dir: Direction) => () => void slideBoard($, dir)

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
          {b.isOver && <Text color="text-danger">No moves left. /sq new deals another board.</Text>}
          <Box>
            <Button key="up" plain label="up" onPress={onSlide('up')} />
            <Text> </Text>
            <Button key="left" plain label="left" onPress={onSlide('left')} />
            <Text> </Text>
            <Button key="down" plain label="down" onPress={onSlide('down')} />
            <Text> </Text>
            <Button key="right" plain label="right" onPress={onSlide('right')} />
            <Text> </Text>
            <Button key="new" plain dimColor label="new" onPress={() => void reset($)} />
            <Text> </Text>
            <Button key="swap" plain dimColor label="word game" onPress={onSwitch} />
            <Text> </Text>
            <Button key="close" plain dimColor label="close" onPress={onClose} />
          </Box>
          {/*
            W-A-S-D is a shape on a QWERTY board, not a set of letters: under
            the same four fingers an AZERTY board reads Z-Q-S-D. The command
            takes both spellings, so this row only says so, and is the first
            thing to go when the room is short.
          */}
          <Box key="azerty" display={hasSpareRow ? 'flex' : 'none'}>
            <Text dimColor>/sq w a s d slides — or z q s d. A run works too: /sq ddss</Text>
          </Box>
          <Text dimColor>/sq word · /sq new · /sq close</Text>
        </Box>
      )
    }
  })
}
