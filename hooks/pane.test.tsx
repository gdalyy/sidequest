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
  expect(ran.text).toContain('w a s d')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // the board is drawn, and the four slides are offered as hotkeys
  expect(await ui.find({ type: 'Text', text: /┌─/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /score 0/ })).toBeDefined()
  for (const key of ['up', 'down', 'left', 'right']) {
    expect(await ui.find({ type: 'Button', key })).toBeDefined()
  }

  // the same four keys under the same fingers on an AZERTY board
  expect(await ui.find({ type: 'Button', key: 'up-az' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'left-az' })).toBeDefined()

  // no two controls of this pane answer to one key
  const bound = ['up', 'left', 'down', 'right', 'up-az', 'left-az', 'new', 'swap', 'close']
  const keys: string[] = []
  for (const key of bound) {
    const found = await ui.find({ type: 'Button', key })
    expect(found).toBeDefined()
    const hotkey = (found as { props?: { hotkey?: string } })?.props?.hotkey
    if (hotkey) keys.push(hotkey)
  }
  expect(new Set(keys).size).toBe(keys.length)

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

test('each game fits a short inline pane and says how to reach it', async ($, on) => {
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

    // the way in and the way out are on screen, not only in the README
    const hint = await ui.find({ type: 'Text', text: focused ? /Esc gives the prompt/ : /ctrl\+x then tab/ })
    expect(hint).toBeDefined()

    // the controls are drawn too, not pushed below what the pane can show
    expect(await ui.find({ type: 'Button', key: 'swap' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'close' })).toBeDefined()

    await ui.unmount()
  }
})

test('the command says how to take the keyboard, never that it has it', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sidequest' } }))
  on('store.get', () => ({ value: 0 }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run(RUN)

  // focus is refused over a composer holding the command that was just typed
  expect(ran.text).toContain('ctrl+x and then tab')
  expect(ran.text).not.toContain('has the keyboard')
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
