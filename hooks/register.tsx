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
const COMMAND = 'sidequest'
const EMPTY_BOARD: Board = { cells: new Array(16).fill(0), score: 0, best: 0, isOver: false }
const KEYS: Record<string, Direction> = { w: 'up', s: 'down', a: 'left', d: 'right' }

const isWorking = atom({ plugin: 'sidequest', key: 'isWorking' } as const, false)
const steps = atom({ plugin: 'sidequest', key: 'steps' } as const, 0)
const board = atom({ plugin: 'sidequest', key: 'board' } as const, EMPTY_BOARD, { shape: 'board-1' })
const codele = atom({ plugin: 'sidequest', key: 'codele' } as const, null, { shape: 'codele-1' })
const showing = atom({ plugin: 'sidequest', key: 'showing' } as const, 'board')

// ---------------------------------------------------------------- the repository

// The file list is read once per load: a reload asks git again, and nothing
// here outlives the session.
let files: string[] | undefined
let root = ''

let tracked: string[] | undefined

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

/** The colours a graded letter is drawn in. */
const TILE: Record<Grade, { backgroundColor: string; color: string }> = {
  right: { backgroundColor: 'bg-success', color: 'on-success' },
  near: { backgroundColor: 'bg-warning', color: 'on-warning' },
  absent: { backgroundColor: 'surface-2', color: 'text-muted' },
}

/** One move, and the best score written through to the store when it grows. */
async function slideBoard($: EngineInterface, dir: Direction): Promise<void> {
  const had = await read($, board)
  if (had.isOver) return reset($)
  const next = play(had, dir, roll)
  if (next === had) return
  await update($, board, () => next)
  if (next.best > had.best) await $.store.set('best', next.best).catch(() => undefined)
}

export const register: Register = (on, options) => {
  const configured = String(options.mode ?? '2048')
  const letters = String(options.word_length ?? String(DEFAULT_LENGTH))
  const isGame = configured === '2048' || configured === 'codele'
  const after = Number(options.after_seconds ?? 20)

  let startedAt = 0
  let isOpen = false
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
    const kept = Number(await $.store.get('best').catch(() => 0)) || 0
    await update($, board, () => newBoard(roll, kept))
    await update($, showing, () => (configured === 'codele' ? 'codele' : 'board'))
    if (configured === 'codele') await newWord($, letters)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    // `focus` is a request the surface grants only over an empty composer,
    // and typing /sidequest is text in the composer, so a pane opened this way
    // does not take the keyboard. Ask anyway — another way in may be able to —
    // and say how to take it rather than claiming it was taken.
    await $.ui.open({ id: PANE, title: 'Sidequest', focus: true, rows: ROWS })
    isOpen = true
    return {
      text: 'Sidequest is open. Press ctrl+x tab to put the keyboard in it, Esc to give it back. Then: w a s d slides, t is the word game, x closes.',
    }
  }).catch(($, e, next) => ({
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

    const onSwitch = () => {
      void (async () => {
        const now = await read($, showing)
        const next = now === 'board' ? 'codele' : 'board'
        await update($, showing, () => next)
        if (next === 'codele' && !(await read($, codele))) await newWord($, letters)
      })()
    }
    const onClose = () => {
      isOpen = false
      void $.ui.close({ id: PANE })
    }

    if ((await read($, showing)) === 'codele') {
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

      return (
        <Box flexDirection="column">
          <Text dimColor>
            {`${header} · guess ${Math.min(word.guesses.length + 1, TRIES)} of ${TRIES}`}
          </Text>
          {word.guesses.map((g, row) => (
            <Box>
              {Array.from({ length: word.length }, (_, i) => i).map(i => {
                const mark = (rows[row] ?? [])[i] ?? 'absent'
                return (
                  <Text backgroundColor={TILE[mark].backgroundColor} color={TILE[mark].color} bold>
                    {` ${(g[i] ?? ' ').toUpperCase()} `}
                  </Text>
                )
              })}
            </Box>
          ))}
          {Array.from({ length: Math.max(0, TRIES - word.guesses.length) }, (_, i) => i).map(i => (
            <Box key={`empty-${i}`}>
              <Text dimColor>{' · '.repeat(word.length)}</Text>
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
              {'abcdefghijklmnopqrstuvwxyz'.split('').map(letter => (
                <Text
                  dimColor={marks[letter] === 'absent'}
                  color={marks[letter] === 'right' ? 'text-success' : marks[letter] === 'near' ? 'text-warning' : undefined}
                >
                  {letter}
                </Text>
              ))}
            </Box>
          )}
          <Input
            key="guess"
            autoFocus
            placeholder={word.isDone ? 'enter for another word' : `${word.length} letters, then enter`}
            onSubmit={(value: string) => void sayWord($, value, letters)}
          />
          <Box>
            <Button key="swap" hotkey="t" plain dimColor label="2048" onPress={onSwitch} />
            <Text> </Text>
            <Button key="close" hotkey="x" plain dimColor label="close" onPress={onClose} />
          </Box>
          <Text dimColor>{e.props.isFocused ? 'Esc to the prompt' : 'ctrl+x tab to play'}</Text>
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
          {b.isOver && <Text color="text-danger">No moves left. Press r for a new board.</Text>}
          <Box>
            <Button key="up" hotkey="w" plain label="up" onPress={onSlide('up')} />
            <Text> </Text>
            <Button key="left" hotkey="a" plain label="left" onPress={onSlide('left')} />
            <Text> </Text>
            <Button key="down" hotkey="s" plain label="down" onPress={onSlide('down')} />
            <Text> </Text>
            <Button key="right" hotkey="d" plain label="right" onPress={onSlide('right')} />
          </Box>
          {/*
            W-A-S-D is a shape on a QWERTY board, not a set of letters: the
            same four keys under the same fingers are Z-Q-S-D on AZERTY, where
            A and Q, W and Z are swapped. Both are bound either way; this row
            only says so, and is the first thing to go when the room is short.
          */}
          <Box key="azerty" display={hasSpareRow ? 'flex' : 'none'}>
            <Text dimColor>azerty </Text>
            <Button key="up-az" hotkey="z" plain dimColor label="up" onPress={onSlide('up')} />
            <Text> </Text>
            <Button key="left-az" hotkey="q" plain dimColor label="left" onPress={onSlide('left')} />
          </Box>
          <Box>
            <Button key="new" hotkey="r" plain dimColor label="new board" onPress={() => void reset($)} />
            <Text> </Text>
            <Button key="swap" hotkey="t" plain dimColor label="codele" onPress={onSwitch} />
            <Text> </Text>
            <Button key="close" hotkey="x" plain dimColor label="close" onPress={onClose} />
          </Box>
          <Text dimColor>{e.props.isFocused ? 'Esc to the prompt' : 'ctrl+x tab to play'}</Text>
        </Box>
      )
    }
  })
}
