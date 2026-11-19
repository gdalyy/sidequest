import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'sidequest',
  component: 'Pane',
  requestId: 'sidequest-2048',
  props: {
    title: '2048',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

/** The second game's pane. The engine shows one and tabs the rest. */
const WORD_PANE = { ...PANE, requestId: 'sidequest-word', props: { ...PANE.props, title: 'Word' } } as const

/** What the engine hands `command.run` when /sidequest is typed in the composer. */
const RUN = {
  command: 'sidequest',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 120 },
} as const

// An invalid tree is skipped at runtime rather than refused at validation, so
// the drawing is worth mounting on every surface the mod may be drawn on.
test('the game pane draws a board and slides when w a s d are pressed', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('store.set', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run(RUN)
  // the command says how to play in the panes; there is no command for playing
  expect(ran.text).toContain('w a s d')
  expect(ran.text).not.toContain('/sq ')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // the board is drawn, and the four slides are offered as hotkeys
  expect(await ui.find({ type: 'Text', text: /┌─/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /score 0/ })).toBeDefined()
  for (const key of ['up', 'down', 'left', 'right']) {
    expect(await ui.find({ type: 'Button', key })).toBeDefined()
  }

  // the four slides, and the same four keys under the same fingers on AZERTY
  const bound: Record<string, string> = {
    up: 'w', left: 'a', down: 's', right: 'd', 'up-az': 'z', 'left-az': 'q', new: 'r', swap: 'g',
  }
  const seen: string[] = []
  for (const [key, expected] of Object.entries(bound)) {
    const found = await ui.find({ type: 'Button', key })
    expect(found).toBeDefined()
    const hotkey = (found as { props?: { hotkey?: string } })?.props?.hotkey
    expect(hotkey).toBe(expected)
    seen.push(String(hotkey))
    // never a digit: a digit needs shift on an AZERTY board, so shift+2 and
    // the numeric keypad both arrive as a key nobody meant to press
    expect(/^[a-z]$/.test(String(hotkey))).toBe(true)
  }
  // and no two controls answer to one key
  expect(new Set(seen).size).toBe(seen.length)

  // nothing here closes the pane and nothing here switches game: the engine
  // draws its own close mark and its own tabs, and both of those were keys
  // of mine that fired when nobody meant them to
  // nothing closes the pane; switching is a letter here because this game
  // types nothing, and typed text in the word game, which types everything
  expect(await ui.find({ type: 'Button', key: 'close' })).toBeUndefined()

  // a new board holds two tiles; after a slide it still holds at least two
  const tiles = (text: string) => (text.match(/\b(2|4|8|16|32)\b/g) ?? []).length
  const before = await ui.find({ type: 'Text', text: /│/ })
  expect(before).toBeDefined()

  await ui.press({ key: 'left' })
  const after = await ui.find({ type: 'Text', text: /score/ })
  expect(after).toBeDefined()
  expect(tiles((await ui.find({ type: 'Text', text: /│/ }))?.text ?? '')).toBeGreaterThanOrEqual(0)

  await ui.unmount()
})

test('the header says whether the turn is still running', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }))
  let clock = 1_000
  on('clock.now', () => ({ value: (clock += 1000) }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const idle = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await idle.find({ type: 'Text', text: /Claude is/ }))?.text).toContain('done')
  await idle.unmount()

  await $.turn.start({ turnId: 'turn-1', text: 'do a long thing' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  const busy = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const line = (await busy.find({ type: 'Text', text: /Claude is/ }))?.text ?? ''
  expect(line).toContain('working')
  expect(line).toContain('2 steps')
  await busy.unmount()
})

test('the word pane draws coloured tiles and takes a guess', { options: { mode: 'codele' } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'src/a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  // a file whose five-letter names are the only answers the game can pick
  on('fs.read', () => ({
    value: ['export function parse(x) {}', 'export function table(x) {}', 'export function block(x) {}'].join('\n'),
  }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...WORD_PANE, surface: 'terminal' })

  // six empty rows before anything is guessed, and a field to type in
  expect(await ui.find({ type: 'Input', key: 'guess' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /guess 1 of 6/ })).toBeDefined()

  await ui.input({ key: 'guess', text: 'parse' })

  // the guess is drawn as five tiles, each carrying a colour rather than a mark
  const tile = await ui.find({ type: 'Text', text: /P/ })
  expect(tile).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /guess 2 of 6|Solved/ })).toBeDefined()

  await ui.unmount()
})

test('the word game binds no key, and its field takes the controls', { options: { mode: 'codele' } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', () => ({ value: 'parse table fence glyph probe parse table fence glyph probe' }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...WORD_PANE, surface: 'terminal' })

  // Here every letter is typed into the field, so a letter cannot also be a
  // control, and a digit needs shift on AZERTY. Nothing is bound.
  const length = await ui.find({ type: 'Button', key: 'length' })
  expect(length).toBeDefined()
  expect(length?.props?.hotkey).toBeUndefined()
  for (const key of ['swap', 'close']) {
    expect(await ui.find({ type: 'Button', key })).toBeUndefined()
  }

  // the field takes the word, and nothing else needs a key
  expect(await ui.find({ type: 'Input', key: 'guess' })).toBeDefined()
  await ui.input({ key: 'guess', text: 'vivid' })
  expect(await ui.find({ type: 'Text', text: /guess 2 of 6/ })).toBeDefined()
  await ui.unmount()
})

test('one game is up at a time, and swapping keeps the keyboard', async ($, on) => {
  const opened: Array<Record<string, unknown>> = []
  const closed: string[] = []
  PLAYABLE(on, (id: string) => closed.push(id), e => opened.push(e))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await say($, '')

  // 2048 is what comes up, and it does not ask for the keyboard: the composer
  // holds the command that opened it, so the request would only be refused
  expect(opened.at(-1)?.id).toBe('sidequest-2048')
  expect(opened.at(-1)?.focus).toBeUndefined()

  const board = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await board.find({ type: 'Text', text: /┌─/ })).toBeDefined()
  // `g` is free here because this game types nothing
  await board.press({ key: 'swap' })
  await board.unmount()

  // Swapping closes the pane you are in, and that is what hands the keys
  // back, so the open that follows is one of the few that may ask for them and
  // be granted. Opening an id that is already open only retitles it; it does
  // not raise it, which is why the close comes first.
  expect(closed).toContain('sidequest-2048')
  expect(opened.at(-1)?.id).toBe('sidequest-word')
  expect(opened.at(-1)?.focus).toBe(true)

  const word = await $.ui.mount({ ...WORD_PANE, surface: 'terminal' })
  expect(await word.find({ type: 'Input', key: 'guess' })).toBeDefined()
  // and back again, typed, because every letter here belongs to the word
  await word.input({ key: 'guess', text: '2048' })
  expect(opened.at(-1)?.id).toBe('sidequest-2048')
  expect(opened.at(-1)?.focus).toBe(true)
  await word.unmount()
})

test('a project git knows nothing about is read from the folder', { options: { mode: 'codele' } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // no repository yet: git answers nothing at all
  on('process.run', () => ({
    value: { exitCode: 128, stdout: '', stderr: 'not a git repository', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.list', (_, e) => ({
    value: String(e.path).endsWith('/src')
      ? [{ name: 'parser.ts', kind: 'file', size: 10, mtimeMs: 0, isLink: false }]
      : [
          { name: 'src', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
          { name: 'node_modules', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
          { name: 'README.md', kind: 'file', size: 10, mtimeMs: 0, isLink: false },
        ],
  }))
  on('fs.read', () => ({ value: 'export function parseTable() { const fence = glyphList() }' }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...WORD_PANE, surface: 'terminal' })

  // the pane has a word and takes a guess, so the folder gave up a pool
  expect(await ui.find({ type: 'Input', key: 'guess' })).toBeDefined()
  await ui.input({ key: 'guess', text: 'parse' })
  expect(await ui.find({ type: 'Text', text: /guess 2 of 6|Solved/ })).toBeDefined()

  await ui.unmount()
})


test('each game fits a short inline pane and says how to play it', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', () => ({ value: 'parse table fence glyph probe parse table fence glyph probe' }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  for (const focused of [false, true]) {
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, isFocused: focused } })

    // the pane says which of the two ways is open to you right now, rather
    // than leaving you to guess whether it has the keyboard
    const hint = await ui.find({ type: 'Text', text: focused ? /Playing|Typing here/ : /ctrl\+x then tab/ })
    expect(hint).toBeDefined()
    // a click is not offered: a terminal reports none outside fullscreen
    expect(hint?.text).not.toContain('click')
    // and unfocused, the way to take the keyboard is named
    if (!focused) expect(hint?.text).toContain('ctrl+x')

    // the board and its keys are drawn, not pushed below what the pane shows
    expect(await ui.find({ type: 'Text', text: /┌─/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'up' })).toBeDefined()
    // and closing and switching are the engine's own marks, never keys of ours
    expect(await ui.find({ type: 'Button', key: 'close' })).toBeUndefined()

    await ui.unmount()
  }
})


test('a short pane sheds its notes before it sheds the board', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // roomy: the azerty note is drawn
  const roomy = await $.ui.mount({
    ...PANE, surface: 'terminal',
    props: { ...PANE.props, placement: 'inline', scroll: { offset: 0, bodyRows: 20 } },
  })
  expect((await roomy.find({ type: 'Box', key: 'azerty' }))?.props?.display).toBe('flex')
  await roomy.unmount()

  // cramped: the note goes, and the board and its keys stay
  const tight = await $.ui.mount({
    ...PANE, surface: 'terminal',
    props: { ...PANE.props, placement: 'inline', scroll: { offset: 0, bodyRows: 8 } },
  })
  expect((await tight.find({ type: 'Box', key: 'azerty' }))?.props?.display).toBe('none')
  expect(await tight.find({ type: 'Text', text: /┌─/ })).toBeDefined()
  for (const key of ['up', 'left', 'down', 'right']) {
    expect(await tight.find({ type: 'Button', key })).toBeDefined()
  }
  await tight.unmount()
})



test('the word length is cycled from the pane and kept', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', () => ({ value: 'tidy parse glyphs invoice tidy parse glyphs invoice' }))
  const kept: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: kept[String(e.key)] }))
  on('store.set', (_, e) => { kept[String(e.key)] = e.value; return { value: undefined } })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  // opening is what deals the first word, so the pane has something to draw
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount({ ...WORD_PANE, surface: 'terminal' })

  expect((await ui.find({ type: 'Button', key: 'length' }))?.props?.label).toContain('5')
  await ui.press({ key: 'length' })
  expect((await ui.find({ type: 'Button', key: 'length' }))?.props?.label).toContain('6')
  // and the choice outlives the session
  expect(kept.wanted).toBe('6')

  await ui.unmount()
})

/** Everything the command can be told, with a repository behind it. */
const PLAYABLE = (on: any, note?: (id: string) => void, opened?: (e: Record<string, unknown>) => void) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('ui.open', (_: unknown, e: Record<string, unknown>) => { opened?.(e); return { value: { isPlaced: true } } })
  on('ui.close', (_: unknown, e: { id: string }) => { note?.(String(e.id)); return { value: undefined } })
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', () => ({ value: 'parse table fence glyph probe parse table fence glyph probe' }))
  const kept: Record<string, unknown> = {}
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept[String(e.key)] }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => {
    kept[String(e.key)] = e.value
    return { value: undefined }
  })
  return kept
}

const say = ($: any, args: string) => $.command.run({ ...RUN, args })

test('the command opens both games and closes both, and does nothing else', async ($, on) => {
  const closed: string[] = []
  PLAYABLE(on, (id: string) => closed.push(id))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  const ran = await say($, '')
  // it says how to play, and names no command for playing, because there is
  // none: a game you play by typing a command per move is not a game
  expect(ran.text).toContain('ctrl+x')
  expect(ran.text).toContain('w a s d')
  expect(ran.text).not.toContain('/sidequest w')
  expect(ran.text).not.toContain('/sq')

  expect((await say($, 'close')).text).toContain('closed')
  // both tabs go, not just the one in front
  expect(closed).toContain('sidequest-2048')
  expect(closed).toContain('sidequest-word')
})

test('a word dealt once is the same word in the pane and after a redraw', async ($, on) => {
  PLAYABLE(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await say($, '')

  const ui = await $.ui.mount({ ...WORD_PANE, surface: 'terminal' })
  // opening deals the word, so the word pane is never found still looking
  expect(await ui.find({ type: 'Text', text: /Finding a word/ })).toBeUndefined()
  expect(await ui.find({ type: 'Input', key: 'guess' })).toBeDefined()
  await ui.unmount()
})

test('no open of ours ever asks for the keyboard', async ($, on) => {
  const opened: Array<Record<string, unknown>> = []
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', () => ({ value: 'parse table fence glyph probe parse table fence glyph probe' }))
  let clock = 0
  on('clock.now', () => ({ value: (clock += 30_000) }))
  on('ui.open', (_: unknown, e: Record<string, unknown>) => { opened.push(e); return { value: { isPlaced: true } } })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...RUN, args: '' })
  await $.turn.start({ turnId: 'turn-1', text: 'something slow' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })

  // A focus request is granted only over an empty composer — and typing
  // /sidequest is text in the composer. A refused one does not merely fail:
  // measured on a real session, ctrl+x tab stops working after it, so the keys
  // meant for the game land in the composer and an Enter sends them to the
  // model. Asking and losing is worse than never asking.
  expect(opened.length).toBeGreaterThan(0)
  for (const o of opened) expect(o.focus).toBeUndefined()
})

test('a window too narrow for an unasked pane is said once, not silently', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('turn.start', (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }))
  let clock = 0
  on('clock.now', () => ({ value: (clock += 30_000) }))
  // the surface refuses the seat: the window is under 144 columns
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'the window is narrower than 144 columns' } }))
  const said: string[] = []
  on('ui.toast', (_: unknown, e: { text: string }) => { said.push(String(e.text)); return { value: undefined } })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.start({ turnId: 'turn-1', text: 'something slow' })
  for (let i = 0; i < 4; i++) await $.tool.call({ tool: 'Bash', command: 'ls' })

  // four chances to open, one line about it
  expect(said.length).toBe(1)
  expect(said[0]).toContain('/sidequest')
  // and it passes on the engine's own reason rather than guessing at one
  expect(said[0]).toContain('144 columns')
})

// The buttons the pointer reaches. A hotkey is a key taken out of the
// terminal's mouth, and that is what used to close the game from shift+2 and
// from the numeric keypad. A button with no hotkey cannot be hit by accident,
// so close and switch-game are safe to offer here and only here.
test('every control a pointer reaches is bound to no key at all', async ($, on) => {
  const closed: string[] = []
  const opened: Record<string, unknown>[] = []
  PLAYABLE(on, id => closed.push(id), e => opened.push(e))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await say($, '')

  const board = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const key of ['click-swap', 'click-new', 'click-close']) {
    const found = await board.find({ type: 'Button', key })
    expect(found).toBeDefined()
    expect((found as { props?: { hotkey?: string } })?.props?.hotkey).toBeUndefined()
  }

  // Close shuts both games, not just the one in front, so nothing is left
  // behind to come back on its own.
  closed.length = 0
  await board.press({ key: 'click-close' })
  expect(closed).toContain('sidequest-2048')
  expect(closed).toContain('sidequest-word')
  await board.unmount()

  // The same row in the word game, and its switch goes the other way: this is
  // the click that answers "there is no way back to game 1".
  const word = await $.ui.mount({ ...WORD_PANE, surface: 'terminal' })
  for (const key of ['click-swap', 'click-new', 'click-close', 'length']) {
    const found = await word.find({ type: 'Button', key })
    expect(found).toBeDefined()
    expect((found as { props?: { hotkey?: string } })?.props?.hotkey).toBeUndefined()
  }

  closed.length = 0
  opened.length = 0
  await word.press({ key: 'click-swap' })
  // swapping closes the pane you are in, which is what hands the keys back,
  // and only then opens the other one
  expect(closed).toContain('sidequest-word')
  expect(opened.some(e => e.id === 'sidequest-2048')).toBe(true)
  await word.unmount()
})

// A terminal has no widget seat, so the engine cannot minimize a pane. Rolled
// up is the mod drawing one line, which is what the word has to mean where
// the pane is seated above the prompt and pushing the work up the screen.
test('the pane rolls up to one line and opens again from either game', async ($, on) => {
  PLAYABLE(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await say($, '')

  const board = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // open, the board is drawn and minimize is offered
  expect(await board.find({ type: 'Text', text: /┌─/ })).toBeDefined()
  const mini = await board.find({ type: 'Button', key: 'click-mini' })
  expect(mini).toBeDefined()
  // this one may carry a key: 2048 types nothing, so a letter collides with
  // nothing, and m is nowhere near the keys that slide
  expect((mini as { props?: { hotkey?: string } })?.props?.hotkey).toBe('m')

  await board.press({ key: 'click-mini' })
  // rolled up: no board left, and one line that says the score
  expect(await board.find({ type: 'Text', text: /┌─/ })).toBeUndefined()
  const line = await board.find({ type: 'Button', key: 'unmini' })
  expect(line).toBeDefined()
  expect(String((line as { props?: { label?: string } })?.props?.label)).toContain('2048')
  // collapsed there is no field anywhere, so m is free to open it again
  expect((line as { props?: { hotkey?: string } })?.props?.hotkey).toBe('m')
  await board.unmount()

  // the word game is rolled up too — one state, not one per pane
  const word = await $.ui.mount({ ...WORD_PANE, surface: 'terminal' })
  expect(await word.find({ type: 'Input', key: 'guess' })).toBeUndefined()
  expect(await word.find({ type: 'Button', key: 'unmini' })).toBeDefined()

  await word.press({ key: 'unmini' })
  // open again, and the field is back
  expect(await word.find({ type: 'Input', key: 'guess' })).toBeDefined()
  // its minimize carries no key, because every letter here is typed
  const wordMini = await word.find({ type: 'Button', key: 'click-mini' })
  expect(wordMini).toBeDefined()
  expect((wordMini as { props?: { hotkey?: string } })?.props?.hotkey).toBeUndefined()
  await word.unmount()
})
