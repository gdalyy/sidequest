/**
 * Wordle, with the answer drawn from the five-letter names your own code
 * declares. Pure functions only, so the tests hold every rule without an
 * engine.
 *
 * The grading is the part worth being careful about: a letter guessed twice
 * when the answer holds it once must come back right once and absent once,
 * which is why the count of each unmatched letter is taken before the near
 * misses are marked.
 */

import type { Codele, Grade, WordSource } from '../types'

export type { Codele, Grade, WordSource }

/** The word lengths the game can be played at. */
export const LENGTHS = [4, 5, 6, 7] as const
export const DEFAULT_LENGTH = 5
export const TRIES = 6

/** Enough words at one length to be worth playing at it. */
export const ENOUGH = 10

/**
 * Five-letter words of each language's own vocabulary, for a repository whose
 * names are too few or too short to make a word of their own.
 */
export const LANGUAGES: readonly {
  id: string
  exts: readonly string[]
  /** Vocabulary to fall back on where a project has too few words of its own. */
  words: readonly string[]
  /** The language's own reserved words, which belong to it and not to a project. */
  reserved: readonly string[]
}[] = [
  { id: 'TypeScript', exts: ['ts', 'tsx'], words: ['const', 'async', 'await', 'class', 'infer', 'never', 'union', 'tuple', 'types', 'props', 'array', 'slice', 'proxy', 'scope', 'throw', 'catch', 'yield', 'super', 'while', 'false'] , reserved: ['async', 'await', 'break', 'catch', 'class', 'const', 'false', 'infer', 'keyof', 'never', 'super', 'throw', 'while', 'yield']},
  { id: 'JavaScript', exts: ['js', 'jsx', 'mjs', 'cjs'], words: ['const', 'async', 'await', 'class', 'array', 'proxy', 'scope', 'throw', 'catch', 'yield', 'super', 'while', 'false', 'slice', 'props', 'event', 'fetch', 'regex'] , reserved: ['async', 'await', 'break', 'catch', 'class', 'const', 'false', 'super', 'throw', 'while', 'yield']},
  { id: 'Python', exts: ['py'], words: ['async', 'await', 'class', 'yield', 'tuple', 'slice', 'bytes', 'print', 'raise', 'super', 'range', 'float', 'ascii', 'items', 'index', 'magic', 'scope', 'while'] , reserved: ['async', 'await', 'break', 'class', 'false', 'print', 'raise', 'while', 'yield']},
  { id: 'Go', exts: ['go'], words: ['defer', 'slice', 'range', 'error', 'panic', 'const', 'mutex', 'bytes', 'array', 'ctxts', 'godoc', 'yield', 'scope', 'while'] , reserved: ['break', 'const', 'defer', 'range']},
  { id: 'Rust', exts: ['rs'], words: ['trait', 'crate', 'match', 'mutex', 'async', 'await', 'slice', 'bytes', 'const', 'panic', 'macro', 'deref', 'clone', 'arena', 'where'] , reserved: ['async', 'await', 'break', 'const', 'crate', 'false', 'match', 'super', 'trait', 'union', 'where', 'while', 'yield']},
  { id: 'Java', exts: ['java'], words: ['class', 'final', 'super', 'throw', 'catch', 'bytes', 'array', 'float', 'short', 'break', 'while', 'yield', 'proxy', 'beans', 'scope'] , reserved: ['break', 'catch', 'class', 'const', 'final', 'float', 'short', 'super', 'throw', 'while']},
  { id: 'Kotlin', exts: ['kt', 'kts'], words: ['class', 'inner', 'async', 'await', 'scope', 'field', 'value', 'where', 'throw', 'catch', 'yield', 'infix', 'const', 'flows'] , reserved: ['break', 'class', 'const', 'false', 'super', 'throw', 'while']},
  { id: 'Swift', exts: ['swift'], words: ['class', 'guard', 'defer', 'throw', 'catch', 'async', 'await', 'actor', 'inout', 'where', 'tuple', 'slice', 'enums', 'final'] , reserved: ['async', 'await', 'break', 'catch', 'class', 'defer', 'false', 'guard', 'inout', 'super', 'throw', 'where', 'while']},
  { id: 'Ruby', exts: ['rb'], words: ['block', 'yield', 'class', 'mixin', 'super', 'range', 'array', 'catch', 'throw', 'procs', 'const', 'scope'] , reserved: ['begin', 'break', 'class', 'false', 'super', 'undef', 'while', 'yield']},
  { id: 'PHP', exts: ['php'], words: ['array', 'class', 'trait', 'yield', 'catch', 'throw', 'const', 'print', 'final', 'super', 'scope', 'while'] , reserved: ['array', 'break', 'catch', 'class', 'clone', 'const', 'empty', 'endif', 'final', 'float', 'isset', 'match', 'print', 'throw', 'trait', 'unset', 'while', 'yield']},
  { id: 'C++', exts: ['c', 'cc', 'cpp', 'h', 'hpp'], words: ['const', 'class', 'union', 'float', 'short', 'while', 'break', 'throw', 'catch', 'alloc', 'stack', 'arena', 'bytes'] , reserved: ['break', 'catch', 'class', 'const', 'float', 'short', 'throw', 'union', 'using', 'while']},
]

/** Which language the repository is written in, by weight of its files. */
export function detectLanguage(paths: readonly string[]): string | undefined {
  const counts: Record<string, number> = {}
  for (const path of paths) {
    const ext = path.split('.').pop()?.toLowerCase() ?? ''
    const lang = LANGUAGES.find(l => l.exts.includes(ext))
    if (lang) counts[lang.id] = (counts[lang.id] ?? 0) + 1
  }
  let best: string | undefined
  for (const [id, n] of Object.entries(counts)) if (!best || n > (counts[best] ?? 0)) best = id
  return best
}

export const wordsOfLanguage = (id: string | undefined): readonly string[] =>
  LANGUAGES.find(l => l.id === id)?.words ?? []

/**
 * A language's reserved words. They turn up in every project written in it,
 * so a project does not own them: `class` is PHP's word, not this codebase's.
 * They stay in the pool, because they are fair answers, but they are credited
 * to the language so that what the game says at the end is true.
 */
export const reservedOfLanguage = (id: string | undefined): ReadonlySet<string> =>
  new Set(LANGUAGES.find(l => l.id === id)?.reserved ?? [])

/**
 * The reserved words of every language at once, not only the one a project is
 * written in. A PHP repository still holds `async` in a JavaScript asset and
 * `where` in a SQL string, and none of those say anything about the work the
 * project does. An answer should be a word of the domain.
 *
 * The union is used, rather than the detected language's alone, because a
 * real repository is rarely written in one language and the point is the same
 * either way: a word the languages own is not the project's.
 */
export const RESERVED: ReadonlySet<string> = new Set(LANGUAGES.flatMap(l => [...l.reserved]))

/** Words to fall back on where neither the project nor its language gives one. */
export const FALLBACK: readonly string[] = [
  'array', 'async', 'await', 'batch', 'block', 'bytes', 'cache', 'catch',
  'chunk', 'class', 'clone', 'const', 'count', 'debug', 'depth', 'embed',
  'empty', 'entry', 'error', 'event', 'fetch', 'field', 'first', 'flush',
  'frame', 'graph', 'group', 'index', 'input', 'label', 'layer', 'limit',
  'lines', 'merge', 'mount', 'nodes', 'order', 'parse', 'patch', 'paths',
  'props', 'proxy', 'query', 'queue', 'range', 'reset', 'retry', 'route',
  'scope', 'shift', 'slice', 'stack', 'state', 'store', 'style', 'table',
  'token', 'trace', 'types', 'value', 'width', 'write', 'yield',
]

/** Files worth reading for a word: source, not data and not lock files. */
export const SOURCE_EXTENSIONS = [
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'rb', 'php',
  'java', 'kt', 'swift', 'cs', 'c', 'cc', 'cpp', 'h', 'hpp', 'vue', 'svelte', 'sh',
]

const IGNORED = /(^|\/)(node_modules|vendor|dist|build|\.min\.|__snapshots__|\.lock$)/

export function isSourceFile(path: string): boolean {
  if (IGNORED.test(path)) return false
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return SOURCE_EXTENSIONS.includes(ext)
}

const wordOf = (length: number) => new RegExp(`^[a-z]{${length}}$`)
const runOf = (length: number) =>
  new RegExp(`(?<![a-z'\u2019])[a-z]{${length}}(?![a-z'\u2019])`, 'g')

/**
 * Ordinary English that says nothing about a project. Technical words a
 * programmer would recognise (`state`, `value`, `field`, `order`, `stack`)
 * are deliberately left in: they are fair answers and they belong to the
 * work. These are the ones that only pad the pool.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'about', 'above', 'after', 'again', 'alone', 'along', 'among', 'asked',
  'began', 'being', 'below', 'bring', 'comes', 'could', 'doing', 'early',
  'every', 'first', 'found', 'given', 'gives', 'going', 'great', 'hence',
  'keeps', 'knows', 'large', 'later', 'least', 'leave', 'looks', 'makes',
  'maybe', 'means', 'meant', 'might', 'needs', 'never', 'noted', 'often',
  'onlys', 'other', 'ought', 'quite', 'reads', 'right', 'seems', 'sense',
  'shall', 'short', 'shown', 'since', 'small', 'speak', 'still', 'stuff',
  'taken', 'takes', 'tells', 'thank', 'their', 'there', 'these', 'thing',
  'think', 'third', 'those', 'three', 'times', 'today', 'total', 'turns',
  'under', 'until', 'using', 'usual', 'wants', 'water', 'where', 'which',
  'while', 'white', 'whole', 'whose', 'words', 'wordy', 'works', 'world',
  'would', 'wrote', 'years', 'young', 'yours',
])

/**
 * Every five-letter word in a piece of text.
 *
 * A camel-cased name is cut at its humps before anything is lowercased, so
 * `parseTable` gives up `parse` and `table`; lowercasing first would leave
 * `parsetable`, which is no word at all. Only a run of exactly five letters
 * counts, so `format` yields nothing rather than `forma`.
 */
export function wordsInText(text: string, length: number = DEFAULT_LENGTH): string[] {
  const spaced = text
    // what is not language at all goes first: a URL, an address, a hash and
    // anything carrying a digit are identifiers, and the five letters cut out
    // of them (`https`, `ecaba`) are not words
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\S+@\S+/g, ' ')
    .replace(/\b[0-9a-f]{8,}\b/gi, ' ')
    .replace(/\S*\d\S*/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
  const out: string[] = []
  // an apostrophe counts as part of the word, so a contraction gives up
  // nothing: `doesn't` offers neither `doesn` nor `oesnt`
  for (const match of spaced.matchAll(runOf(length))) out.push(match[0])
  return out
}

/**
 * Builds the answer pool out of everything the project has written: its
 * names, its prose, its commit messages. A curated list runs out; this grows
 * with the repository, which is what keeps the game from repeating.
 */
/** How often a word must appear before it counts as the project's vocabulary. */
export const LEAST = 2

export function vocabularyOf(
  texts: readonly string[],
  length: number = DEFAULT_LENGTH,
  least = LEAST,
): string[] {
  const counts: Record<string, number> = {}
  for (const text of texts) {
    for (const word of wordsInText(text, length)) {
      // ordinary English says nothing about the project; a reserved word says
      // only which language it is written in
      if (STOPWORDS.has(word) || RESERVED.has(word)) continue
      counts[word] = (counts[word] ?? 0) + 1
    }
  }
  // used once it is an accident — a name in a fixture, a typo, a fragment of
  // something that was not language; used twice it is vocabulary
  return Object.keys(counts)
    .filter(word => (counts[word] ?? 0) >= least)
    .sort()
}

/** The names of exactly `length` letters among `symbols`, lowercased. */
export function wordsFrom(symbols: readonly string[], length: number = DEFAULT_LENGTH): string[] {
  const is = wordOf(length)
  const out = new Set<string>()
  for (const symbol of symbols) {
    const lower = symbol.toLowerCase()
    if (is.test(lower)) out.add(lower)
  }
  return [...out]
}

/** Splits a name into its parts, so `parseTable` yields `parse` and `table`. */
const parts = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

/**
 * A project's jargon: the five-letter words its own names are built from,
 * commonest first. A word the repository uses many times is its vocabulary;
 * one used once is an accident, so a word must appear at least twice.
 *
 * This reads parts, not whole names, which is what makes it jargon rather
 * than a list of identifiers: `glyphList` and `parseTable` give up `glyph`,
 * `parse` and `table`, none of which is a five-letter name on its own.
 */
export function jargonFrom(
  symbols: readonly string[],
  least = 2,
  length: number = DEFAULT_LENGTH,
): string[] {
  const is = wordOf(length)
  const counts: Record<string, number> = {}
  for (const symbol of symbols) {
    for (const part of parts(symbol)) {
      const word = part.toLowerCase()
      if (is.test(word)) counts[word] = (counts[word] ?? 0) + 1
    }
  }
  return Object.entries(counts)
    .filter(([, n]) => n >= least)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
}

/**
 * Picks an answer: this project's own jargon where it has enough, else the
 * vocabulary of the language it is written in, else plain programming words.
 */
/** Enough of a project's own words to carry the game on their own. */
export const RICH = 10

/** How many recent answers are held back, so nothing comes round again soon. */
export const AVOID = 60

/**
 * Everything this project could be asked about, each word carrying where it
 * came from so the game can say so truthfully at the end.
 *
 * The project's own vocabulary comes first and is usually all of it. Its
 * language is added only for a project too small to carry the game, and the
 * built-in words only for a folder with no code at all.
 */
export function poolFor(
  texts: readonly string[],
  paths: readonly string[],
  length: number = DEFAULT_LENGTH,
): WordSource[] {
  const own = vocabularyOf(texts, length)
  const language = detectLanguage(paths)
  const pool: WordSource[] = own.map(word => ({ word, from: 'this project' }))
  if (pool.length < RICH) {
    for (const word of wordsOfLanguage(language)) {
      if (word.length === length && !own.includes(word)) {
        pool.push({ word, from: language ?? 'programming' })
      }
    }
  }
  if (pool.length < RICH) {
    const had = new Set(pool.map(p => p.word))
    for (const word of FALLBACK) {
      if (word.length === length && !had.has(word)) pool.push({ word, from: 'programming' })
    }
  }
  return pool
}

/**
 * Takes one at random, never one of the last `avoid` answers while anything
 * else is left. Where the pool is smaller than the memory, the memory gives
 * way rather than the game running out of words.
 */
export function pickFrom(
  pool: readonly WordSource[],
  rnd: () => number,
  avoid: readonly string[] = [],
): WordSource {
  if (pool.length === 0) return { word: 'parse', from: 'programming' }

  // The memory is never allowed to cover the whole pool: at most one word
  // short of it, counting back from the newest. A project with 300 words
  // forgets after 60; a project with 20 remembers 19, so the one word left is
  // the one played longest ago. Nothing runs out, and nothing repeats until
  // every other word has had its turn.
  const keep = Math.min(avoid.length, pool.length - 1)
  const recent = new Set(avoid.slice(avoid.length - keep))
  const fresh = pool.filter(p => !recent.has(p.word))
  const from = fresh.length > 0 ? fresh : pool
  return from[Math.floor(rnd() * from.length) % from.length] as WordSource
}

/** The pool and one word from it, for a caller that wants both at once. */
export function pickWord(
  texts: readonly string[],
  paths: readonly string[],
  rnd: () => number,
  avoid: readonly string[] = [],
): WordSource {
  return pickFrom(poolFor(texts, paths), rnd, avoid)
}

/**
 * Grades one guess against the answer: `right` in place, `near` elsewhere in
 * the word, `absent` not in it. A letter is marked `near` only while the
 * answer still has one of it left unmatched.
 */
export function grade(guess: string, word: string): Grade[] {
  const marks: Grade[] = new Array(word.length).fill('absent')
  const left: Record<string, number> = {}

  for (let i = 0; i < word.length; i++) {
    if (guess[i] === word[i]) marks[i] = 'right'
    else {
      const letter = word[i] as string
      left[letter] = (left[letter] ?? 0) + 1
    }
  }
  for (let i = 0; i < word.length; i++) {
    if (marks[i] === 'right') continue
    const letter = guess[i] as string
    if ((left[letter] ?? 0) > 0) {
      marks[i] = 'near'
      left[letter] = (left[letter] as number) - 1
    }
  }
  return marks
}

/** The best thing known about each letter guessed so far, for the alphabet row. */
export function letterMarks(game: Codele): Record<string, Grade> {
  const best: Record<string, Grade> = {}
  const rank: Record<Grade, number> = { absent: 0, near: 1, right: 2 }
  for (const guess of game.guesses) {
    const marks = grade(guess, game.word)
    for (let i = 0; i < game.word.length; i++) {
      const letter = guess[i] as string
      const mark = marks[i] as Grade
      const had = best[letter]
      if (!had || rank[mark] > rank[had]) best[letter] = mark
    }
  }
  return best
}

export const newGame = (picked: WordSource): Codele => ({
  word: picked.word,
  from: picked.from,
  // the length travels with the game, so a pane drawn after the setting
  // changed still draws the board the word it holds actually needs
  length: picked.word.length,
  guesses: [],
  isDone: false,
  isWon: false,
})

/** Whether `text` is a guess the game will take. */
export const isGuessable = (text: string, length: number = DEFAULT_LENGTH): boolean =>
  wordOf(length).test(text.trim().toLowerCase())

/** Takes a guess; anything that is not five letters leaves the game alone. */
export function guess(game: Codele, text: string): Codele {
  if (game.isDone) return game
  const word = text.trim().toLowerCase()
  if (!isGuessable(word, game.word.length)) return game
  const guesses = [...game.guesses, word]
  const isWon = word === game.word
  return { ...game, guesses, isWon, isDone: isWon || guesses.length >= TRIES }
}
