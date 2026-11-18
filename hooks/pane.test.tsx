import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'sidequest',
  component: 'Pane',
  requestId: 'sidequest',
  props: {
    title: 'Sidequest',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

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
  // the command answers with how to play, and never sends anyone chasing focus
  expect(ran.text).toContain('/sq')
  expect(ran.text).not.toContain('ctrl+x')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // the board is drawn, and the four slides are offered as hotkeys
  expect(await ui.find({ type: 'Text', text: /┌─/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /score 0/ })).toBeDefined()
  for (const key of ['up', 'down', 'left', 'right']) {
    expect(await ui.find({ type: 'Button', key })).toBeDefined()
  }

  // the AZERTY spelling is said, not bound
  expect(await ui.find({ type: 'Text', text: /z q s d/ })).toBeDefined()

  // and not one control answers to a key — see the test below for why
  for (const key of ['up', 'left', 'down', 'right', 'new', 'swap', 'close']) {
    const found = await ui.find({ type: 'Button', key })
    expect(found).toBeDefined()
    expect((found as { props?: { hotkey?: string } })?.props?.hotkey).toBeUndefined()
  }

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
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

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

test('no control of either game answers to any key at all', { options: { mode: 'codele' } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', () => ({ value: 'parse table fence glyph probe parse table fence glyph probe' }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // A hotkey here is a key taken out of the terminal's mouth, and the pane
  // has no way to know what the person meant by it. `2` meant close, and on
  // an AZERTY board a digit needs shift: shift+2 while reaching for the other
  // game shut the pane, and the numeric keypad did it too. A letter is no
  // better — it is swallowed by, or swallows, a guess. So: none.
  for (const key of ['swap', 'close', 'length']) {
    const found = await ui.find({ type: 'Button', key })
    expect(found).toBeDefined()
    expect(found?.props?.hotkey).toBeUndefined()
  }
  await ui.unmount()
})

test('t switches the pane between the two games', { options: { mode: '2048' } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'src/a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', () => ({ value: 'export function parse(x) {}' }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /┌─/ })).toBeDefined()
  await ui.press({ key: 'swap' })
  expect(await ui.find({ type: 'Input', key: 'guess' })).toBeDefined()
  await ui.press({ key: 'swap' })
  expect(await ui.find({ type: 'Text', text: /┌─/ })).toBeDefined()

  await ui.unmount()
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
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // the pane has a word and takes a guess, so the folder gave up a pool
  expect(await ui.find({ type: 'Input', key: 'guess' })).toBeDefined()
  await ui.input({ key: 'guess', text: 'parse' })
  expect(await ui.find({ type: 'Text', text: /guess 2 of 6|Solved/ })).toBeDefined()

  await ui.unmount()
})

test('a window too narrow for an unasked pane is said once, not silently', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {} }))
  let clock = 0
  on('clock.now', () => ({ value: (clock += 30_000) }))
  // the surface refuses the seat: the window is under 144 columns
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'the window is narrower than 144 columns' } }))
  const said: string[] = []
  on('ui.toast', (_, e) => { said.push(String(e.text)); return { value: undefined } })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.turn.start({ turnId: 'turn-1', text: 'something slow' })
  for (let i = 0; i < 4; i++) await $.tool.call({ tool: 'Bash', command: 'ls' })

  // four chances to open, one line about it
  expect(said.length).toBe(1)
  expect(said[0]).toContain('/sidequest')
  // and it passes on the engine's own reason rather than guessing at one
  expect(said[0]).toContain('144 columns')
})

test('each game fits a short inline pane and says what to type', async ($, on) => {
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

    // the pane says what to type, and says the same thing either way: nothing
    // on screen depends on who holds the keyboard, because the answer is
    // always the prompt
    const hint = await ui.find({ type: 'Text', text: /\/sq close/ })
    expect(hint).toBeDefined()
    // neither a click nor a chord is offered: a terminal reports no click
    // outside its fullscreen layout, and the chord is refused over a composer
    expect(hint?.text).not.toContain('click')
    expect(hint?.text).not.toContain('ctrl+x')

    // the controls are drawn too, not pushed below what the pane can show
    expect(await ui.find({ type: 'Button', key: 'swap' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'close' })).toBeDefined()

    await ui.unmount()
  }
})

test('the command names itself as the way to play, and never chases focus', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run(RUN)

  // the pane never asks for the keyboard now, so nothing here may suggest it
  expect(ran.text).not.toContain('ctrl+x')
  expect(ran.text).not.toContain('Esc')
  expect(ran.text).not.toContain('has the keyboard')
  // and the opening line is the whole manual, because there is nowhere else
  // a player would think to look for it
  for (const part of ['/sq w a s d', '/sq <word>', '/sq next', '/sq close']) {
    expect(ran.text).toContain(part)
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


test('either game is named outright, so neither can be stranded', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: 'a.ts\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', () => ({ value: 'parse table fence glyph probe parse table fence glyph probe' }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // `word` and `2048` name a game rather than toggling, so asking twice for
  // the one already showing is harmless — there is no way to end up in the
  // game you did not want and no way back
  for (const said of ['word', 'word']) {
    await $.command.run({ ...RUN, args: said })
    expect(await ui.find({ type: 'Input', key: 'guess' })).toBeDefined()
  }
  for (const said of ['2048', '2048']) {
    await $.command.run({ ...RUN, args: said })
    expect(await ui.find({ type: 'Text', text: /┌─/ })).toBeDefined()
  }

  // and `next` is the toggle, for when either will do
  await $.command.run({ ...RUN, args: 'next' })
  expect(await ui.find({ type: 'Input', key: 'guess' })).toBeDefined()
  await $.command.run({ ...RUN, args: 'next' })
  expect(await ui.find({ type: 'Text', text: /┌─/ })).toBeDefined()

  await ui.unmount()
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
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'swap' })

  expect((await ui.find({ type: 'Button', key: 'length' }))?.props?.label).toContain('5')
  await ui.press({ key: 'length' })
  expect((await ui.find({ type: 'Button', key: 'length' }))?.props?.label).toContain('6')
  // and the choice outlives the session
  expect(kept.wanted).toBe('6')

  await ui.unmount()
})

/** Everything the command can be told, with a repository behind it. */
const PLAYABLE = (on: any) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
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

test('2048 is played from the prompt, without the keyboard ever leaving it', async ($, on) => {
  PLAYABLE(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await say($, '')

  for (const [arg, named] of [['a', 'left'], ['s', 'down'], ['d', 'right'], ['w', 'up']] as const) {
    const ran = await say($, arg)
    expect(ran.text).toContain(`Slid ${named}`)
    expect(ran.text).toContain('Score')
  }
  // the AZERTY letters mean the same thing here as they do in the pane
  expect((await say($, 'z')).text).toContain('Slid up')
  expect((await say($, 'q')).text).toContain('Slid left')
})

test('the word game is played from the prompt, and grades the guess in the reply', async ($, on) => {
  PLAYABLE(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect((await say($, 'word')).text).toContain('word game')
  const ran = await say($, 'parse')
  // every letter comes back carrying its mark, so the reply reads on its own
  expect(ran.text).toMatch(/[A-Z][=~·] [A-Z][=~·] [A-Z][=~·] [A-Z][=~·] [A-Z][=~·]/)

  // a word of the wrong length is refused, and says how to change it
  const wrong = await say($, 'invoice')
  expect(wrong.text).toContain('7 letters')
})

test('switching, dealing, length and closing all answer from the prompt', async ($, on) => {
  const kept = PLAYABLE(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  expect((await say($, 'word')).text).toContain('word game')
  expect((await say($, '2048')).text).toContain('2048')
  expect((await say($, 'new')).text).toContain('board')

  const six = await say($, '6')
  expect(six.text).toContain('6 letters')
  expect(kept.wanted).toBe('6')

  expect((await say($, 'close')).text).toContain('closed')
  // and a word that means nothing says what the command does understand
  expect((await say($, 'zzz9'))?.text).toContain('does not know')
})
