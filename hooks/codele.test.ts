import { expect, test } from 'claude-code/testing'

import {
  AVOID,
  FALLBACK,
  DEFAULT_LENGTH,
  ENOUGH,
  LEAST,
  LENGTHS,
  RESERVED,
  STOPWORDS,
  detectLanguage,
  grade,
  guess,
  isGuessable,
  jargonFrom,
  pickFrom,
  poolFor,
  vocabularyOf,
  wordsInText,
  letterMarks,
  newGame,
  pickWord,
  wordsFrom,
  wordsOfLanguage,
} from './codele'

const fixed = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}

test('a letter in place is right, elsewhere is near, missing is absent', () => {
  expect(grade('parse', 'parse')).toEqual(['right', 'right', 'right', 'right', 'right'])
  // the a of "table" sits where the a of "parse" sits; the e likewise
  expect(grade('table', 'parse')).toEqual(['absent', 'right', 'absent', 'absent', 'right'])
  // r lands in place; s and p are in the word but elsewhere
  expect(grade('strip', 'parse')).toEqual(['near', 'absent', 'right', 'absent', 'near'])
})

test('a letter guessed twice is graded once when the answer holds it once', () => {
  // "parse" holds one a, and it is matched in place, so the other two a's
  // get nothing at all: this is the rule that trips most implementations
  expect(grade('aaazz', 'parse')).toEqual(['absent', 'right', 'absent', 'absent', 'absent'])

  // "slice" holds one e, matched in place by the last e, so the two leading
  // e's are absent; the i is in the word but in the wrong seat
  expect(grade('eerie', 'slice')).toEqual(['absent', 'absent', 'absent', 'near', 'right'])
})

test('a guess that is not five letters changes nothing', () => {
  const game = newGame({ word: 'parse', from: 'test' })
  expect(guess(game, 'par')).toEqual(game)
  expect(guess(game, 'parsed')).toEqual(game)
  expect(guess(game, 'pa r5')).toEqual(game)
  expect(isGuessable('parse')).toBe(true)
  expect(isGuessable('PARSE')).toBe(true)
  expect(isGuessable('par5e')).toBe(false)
})

test('a guess is taken in any case, and the right one wins', () => {
  const won = guess(newGame({ word: 'parse', from: 'test' }), 'PARSE')
  expect(won.guesses).toEqual(['parse'])
  expect(won.isWon).toBe(true)
  expect(won.isDone).toBe(true)
})

test('six wrong guesses end it, and nothing after counts', () => {
  let game = newGame({ word: 'parse', from: 'test' })
  for (const word of ['table', 'block', 'index', 'store', 'write', 'quick']) game = guess(game, word)
  expect(game.guesses.length).toBe(6)
  expect(game.isDone).toBe(true)
  expect(game.isWon).toBe(false)
  expect(guess(game, 'parse')).toEqual(game)
})

test('the alphabet row keeps the best thing known about a letter', () => {
  // "a" is near in the first guess and right in the second: right wins
  let game = newGame({ word: 'parse', from: 'test' })
  game = guess(game, 'avoid')
  game = guess(game, 'parse')
  expect(letterMarks(game).a).toBe('right')
  expect(letterMarks(game).v).toBe('absent')
})

test('wordsFrom keeps the names that are already five letters', () => {
  const symbols = ['parse', 'Table', 'convertAll', 'block', 'x', 'store']
  expect(wordsFrom(symbols).sort()).toEqual(['block', 'parse', 'store', 'table'])
})

test('jargon is built from the parts of names, commonest first', () => {
  // `glyph` appears three times, `table` twice, `rowed` once
  const symbols = ['glyphList', 'glyphBullet', 'toGlyph', 'parseTable', 'alignedTable', 'rowedOnce']
  const jargon = jargonFrom(symbols)
  expect(jargon[0]).toBe('glyph')
  expect(jargon.includes('table')).toBe(true)
  // used once, so it is an accident rather than this project's vocabulary
  expect(jargon.includes('rowed')).toBe(false)
  // a part that is not five letters is no answer
  expect(jargon.includes('list')).toBe(false)
})

test('wordsInText takes runs of exactly five letters', () => {
  expect(wordsInText('the parse table holds a glyph')).toEqual(['parse', 'table', 'holds', 'glyph'])
  // a camel-cased name is cut at its humps first, so its parts are words
  expect(wordsInText('parseTable glyphList')).toEqual(['parse', 'table', 'glyph'])
  // six letters is not five: no window is cut out of a longer word
  expect(wordsInText('format formatting')).toEqual([])
  expect(wordsInText('Slack and JIRA')).toEqual(['slack'])
  expect(wordsInText('snake_case_words here')).toEqual(['snake', 'words'])
})

test('the vocabulary gathers every text and drops ordinary English', () => {
  const vocab = vocabularyOf([
    'export function parseTable() {}',
    'parseTable again, and the fence',
    '// these are the words that would be there anyway',
    'fixed the fence so quotes do not break',
  ])
  expect(vocab.includes('parse')).toBe(true)
  expect(vocab.includes('table')).toBe(true)
  expect(vocab.includes('fence')).toBe(true)
  // plain English is held back, so the answers stay the project's
  for (const filler of ['these', 'there', 'would', 'words']) {
    expect(vocab.includes(filler)).toBe(false)
  }
})

test('a reserved word of any language is not the project\'s vocabulary', () => {
  const vocab = vocabularyOf([
    'class Invoice { const RATE = 1 } class Invoice { const RATE = 2 }',
    'async await yield trait crate guard defer where while',
    'async await yield trait crate guard defer where while',
  ])
  // the project's own word survives being surrounded by keywords
  expect(vocab.includes('rates')).toBe(false)
  for (const keyword of ['class', 'const', 'async', 'await', 'yield', 'trait', 'crate', 'guard', 'defer', 'where', 'while']) {
    expect(vocab.includes(keyword)).toBe(false)
  }
  // every language's words go, not only the one the project is written in
  expect(RESERVED.has('crate')).toBe(true)
  expect(RESERVED.has('isset')).toBe(true)
  expect(RESERVED.has('keyof')).toBe(true)
})

test('a word used once is an accident, not vocabulary', () => {
  const once = vocabularyOf(['the agent saw a zebra'])
  expect(once.includes('agent')).toBe(false)
  const twice = vocabularyOf(['the agent saw a zebra', 'another agent'])
  expect(twice.includes('agent')).toBe(true)
  expect(twice.includes('zebra')).toBe(false)
  expect(LEAST).toBe(2)
})

test('urls, addresses, hashes and digits give up no words', () => {
  // the whole address goes, path included: a word inside a URL is not prose
  expect(wordsInText('see https://example.com/table for more')).toEqual([])
  expect(wordsInText('the audit at https://x.co/y passed twice')).toEqual(['audit', 'twice'])
  // the address goes whole; `about` is left for the stopword list to drop
  expect(wordsInText('mail someone@example.com about audit')).toEqual(['about', 'audit'])
  // a hex blob is an identifier, and the letters cut out of it are not words
  expect(wordsInText('commit ad2339ecabaf1209 fixed')).toEqual(['fixed'])
  expect(wordsInText('v2table parse3 plain')).toEqual(['plain'])
})

test('a contraction closes up rather than splitting', () => {
  // splitting would offer `doesn`, which is no word
  expect(wordsInText("it doesn't parse parse")).toEqual(['parse', 'parse'])
  expect(wordsInText("they aren't there")).toEqual(['there'])
  // neither half of a contraction is offered
  expect(wordsInText("that doesn't work")).toEqual([])
})

test('every stopword is itself a five-letter word', () => {
  for (const word of STOPWORDS) expect(word.length).toBe(5)
  expect(STOPWORDS.size).toBeGreaterThan(50)
})

test('the pool is the project when it has words, and says so', () => {
  const one = 'parseTable blockQuote glyphList fenceOpen tokenList sliceOne probeTwo indexRow styleCell quoteEnd'
  // every word twice, since one use is not yet vocabulary
  const texts = [one, one]
  const pool = poolFor(texts, ['a.ts'])
  expect(pool.length).toBeGreaterThanOrEqual(10)
  expect(pool.every(p => p.from === 'this project')).toBe(true)
})

test('a project with almost no words borrows its language, then the built-ins', () => {
  const thin = poolFor(['const x = 1'], ['main.py', 'app.py'])
  expect(thin.some(p => p.from === 'Python')).toBe(true)

  const bare = poolFor([''], ['notes.txt'])
  expect(bare.some(p => p.from === 'programming')).toBe(true)
  expect(bare.length).toBeGreaterThanOrEqual(10)
})

test('a word is picked at random and never one just used', () => {
  const pool = ['parse', 'table', 'fence', 'glyph', 'probe', 'close'].map(word => ({ word, from: 'this project' }))

  // over many rolls every word of the pool comes up: nothing is unreachable
  const seen = new Set<string>()
  for (let i = 0; i < 60; i++) seen.add(pickFrom(pool, fixed([i / 60])).word)
  expect(seen.size).toBe(pool.length)

  // the five just played are held back, so the sixth is the only one left
  const avoid = ['parse', 'table', 'fence', 'glyph', 'probe']
  for (let i = 0; i < 12; i++) expect(pickFrom(pool, fixed([i / 12]), avoid).word).toBe('close')
})

test('a pool smaller than the memory cycles instead of running out', () => {
  const words = ['parse', 'table', 'fence', 'glyph', 'probe']
  const pool = words.map(word => ({ word, from: 'this project' }))

  // play far past the size of the pool, keeping the memory the game keeps
  const played: string[] = []
  for (let i = 0; i < 40; i++) {
    const picked = pickFrom(pool, fixed([(i * 7) % 10 / 10]), played)
    played.push(picked.word)
  }

  // never the same word twice running, however small the pool
  for (let i = 1; i < played.length; i++) expect(played[i]).not.toBe(played[i - 1])

  // every word of the pool is used before any of them comes round again
  for (let i = 0; i + words.length <= played.length; i += words.length) {
    expect(new Set(played.slice(i, i + words.length)).size).toBe(words.length)
  }
})

test('a pool of one word is still playable', () => {
  const pool = [{ word: 'parse', from: 'this project' }]
  expect(pickFrom(pool, fixed([0.5]), ['parse', 'parse']).word).toBe('parse')
  expect(pickFrom([], fixed([0.5])).word).toBe('parse')
  expect(AVOID).toBeGreaterThan(10)
})

test('the language is the one most of the files are written in', () => {
  expect(detectLanguage(['a.py', 'b.py', 'c.ts'])).toBe('Python')
  expect(detectLanguage(['a.rs', 'b.rs'])).toBe('Rust')
  expect(detectLanguage(['readme.md'])).toBe(undefined)
})

test('every built-in word is a playable five-letter word', () => {
  for (const word of FALLBACK) expect(isGuessable(word)).toBe(true)
  expect(new Set(FALLBACK).size).toBe(FALLBACK.length)
})


test('the game plays at any length the setting allows', () => {
  for (const length of LENGTHS) {
    const made = 'the ' + 'x'.repeat(length) + ' and ' + 'x'.repeat(length)
    expect(wordsInText(made, length)).toEqual(['x'.repeat(length), 'x'.repeat(length)])
  }
  expect(LENGTHS.includes(DEFAULT_LENGTH as 4 | 5 | 6 | 7)).toBe(true)
  expect(ENOUGH).toBeGreaterThan(1)
})

test('words are cut to the length asked for and no other', () => {
  const text = 'tidy parse glyphs invoice tidy parse glyphs invoice'
  expect(vocabularyOf([text], 4)).toEqual(['tidy'])
  expect(vocabularyOf([text], 5)).toEqual(['parse'])
  expect(vocabularyOf([text], 6)).toEqual(['glyphs'])
  expect(vocabularyOf([text], 7)).toEqual(['invoice'])
})

test('grading and guessing work at a length other than five', () => {
  const seven = newGame({ word: 'invoice', from: 'this project' })
  expect(seven.length).toBe(7)
  expect(grade('invoice', 'invoice')).toEqual(new Array(7).fill('right'))
  expect(grade('voicing', 'invoice').length).toBe(7)

  // a guess of the wrong length changes nothing
  expect(guess(seven, 'parse')).toEqual(seven)
  const played = guess(seven, 'payment')
  expect(played.guesses).toEqual(['payment'])
  expect(isGuessable('payment', 7)).toBe(true)
  expect(isGuessable('parse', 7)).toBe(false)
})

test('a four-letter game is graded with the same duplicate rule', () => {
  // "deed" holds two e's and both are matched in place, so the two e's of the
  // guess that are not in place get nothing at all
  expect(grade('eeee', 'deed')).toEqual(['absent', 'right', 'right', 'absent'])

  // "need" holds two e's, only one of them matched, so one spare is still owed
  expect(grade('eden', 'need')).toEqual(['near', 'near', 'right', 'near'])
})

test('the pool is built per length, and a curated word only joins its own', () => {
  const texts = ['const rate = 1', 'const rate = 2']
  // the built-in and language lists are five letters, so they fill a
  // five-letter game and leave a six-letter one to the project alone
  expect(poolFor(texts, ['a.php'], 5).length).toBeGreaterThanOrEqual(10)
  expect(poolFor(texts, ['a.php'], 6).every(p => p.word.length === 6)).toBe(true)
  for (const length of LENGTHS) {
    for (const entry of poolFor(texts, ['a.php'], length)) {
      expect(entry.word.length).toBe(length)
    }
  }
})