# sidequest

A Claude Code plugin that gives you **2048** and a **Wordle built from your
own code** in a pane beside the chat, for the minutes Claude spends working.

A long turn leaves you watching a spinner. Twenty seconds in, sidequest opens
a board next to the transcript. It takes the keyboard only when you ask for
it, so what you are typing keeps going to the prompt, and the pane's first
line tells you whether the turn you are waiting on is still running — you can
play without leaving the game to check.

```
 Claude is working · 7 steps

 score 2144   best 3010   tile 128

 ┌──────┬──────┬──────┬──────┐
 │   2  │   ·  │   4  │   2  │
 ├──────┼──────┼──────┼──────┤
 │   8  │  16  │   ·  │   4  │
 ├──────┼──────┼──────┼──────┤
 │  32  │   4  │   8  │  16  │
 ├──────┼──────┼──────┼──────┤
 │   4  │  64  │ 128  │   8  │
 └──────┴──────┴──────┴──────┘

 w: up  a: left  s: down  d: right   t: codele
```

Press `t` and the same pane becomes a word game. Guess, and each letter comes
back green in place, yellow elsewhere in the word, dim if it is not there at
all; the alphabet under the grid keeps what you have ruled out.

The answer is **a word your project wrote**, drawn at random. Nothing is
curated: the pool is harvested from everything the project holds — its source,
its markdown, and its commit messages — so it is as large as the project and
grows with every commit. copyas yields **153 words**, from `alloc` and `async`
to `flush`, `parse`, `table` and `width`.

### How the pool is loaded

Once per session, the first time the word game is wanted:

1. **The file list.** `git ls-files`, or, where git lists nothing — a folder
   with no repository, or one whose files have never been staged — a bounded
   walk of the folder itself, five levels deep and 400 files at most, skipping
   `node_modules`, `dist`, `target` and the like. A new project is exactly
   where git knows least, so it must not be the only way of looking.
2. **The text.** Up to 60 source files and 30 files of prose or configuration
   (markdown, YAML, Twig, HTML, SQL, TOML, `.po`), plus `git log` for the last
   500 commit messages. Code is not the only place a project writes its own
   words: templates and configuration carry the vocabulary of the domain,
   which the source often only abbreviates.
3. **The words.** Every run of exactly five letters, names cut at their humps
   first, ordinary English dropped, duplicates folded together.
4. **The gaps.** Fewer than ten words of its own and the project's language
   fills in; an empty folder falls back to plain programming words.

The pool is held for the session, since reading a repository is the slow part
and its vocabulary does not change between two guesses.

An answer should be a word about the work, so four things are held back:

- **Reserved words of every language**, not only the one the project is
  written in — a PHP repository still holds `async` in a JavaScript asset and
  `where` in a SQL string. `class` says which language this is, never what it
  does. 37 words across 11 languages.
- **Ordinary English** — `these`, `would`, `rather`: 93 stopwords.
- **What is not language at all** — URLs, email addresses, hashes and
  anything carrying a digit are cut out whole before a word is read, so
  `https` and the `ecaba` inside a commit hash never become answers. A
  contraction gives up neither half: `doesn't` offers no `doesn`.
- **Words used once.** Used once it is an accident — a name in a fixture, a
  typo, a fragment; used twice it is vocabulary.

Names are cut at their humps before anything is lowercased, so `parseTable`
gives up `parse` and `table`; lowercasing first would leave `parsetable`,
which is no word at all. Technical words a programmer would recognise
(`state`, `value`, `stack`) stay in: they are fair answers and they belong to
the work.

### How long a word

Five letters is the Wordle habit, not a rule, and it is the narrowest band a
project has: a 1,700-file API holds 711 distinct five-letter words but 819 of
six and 858 of seven. So **Word length** in `/config` takes `4`, `5`, `6`, `7`
or `mixed`, and `mixed` varies it from round to round, which uses the most of
a project's vocabulary. A length the project has too few words for falls back
to the one it has most of, so the game is never left unplayable.

On that same API, after everything above is held back:

| Letters | Words |
|---------|-------|
| 4 | 327 |
| 5 | 293 |
| 6 | 386 |
| 7 | 383 |
| **mixed** | **1,389** |

They are words that say what the project is for — `audit`, `badge`, `buyer`,
`claim`, `agent`, `crime`, `guest` — and the last **60 answers are never
repeated**, so a session of play never comes round again. Where a project is
smaller than that, the memory shortens to one word less than the pool, so
every word is played before any of them returns. Only where a project has fewer than ten words of its own does the
vocabulary of its language fill in — `defer` and `panic` in Go, `trait` and
`crate` in Rust, `yield` and `tuple` in Python — and only an empty folder
falls back to plain programming words. When the game ends it says which of the
three the answer came from.

```
 guess 3 of 6

  T  A  B  L  E
  P  A  R  S  E
  _  _  _  _  _

 abcdefghijklmnopqrstuvwxyz
```

Both games were chosen for one reason: **neither needs explaining.** You press
a key, tiles slide; you type a word, letters go green. A game that needs a
tutorial is the wrong thing to put in front of someone who has twenty seconds
and their mind still on the task they are waiting for. A dungeon crawl was
built and thrown away for exactly that.

Your best score is kept across sessions.

## Usage

```
/sidequest     open the pane
```

| Key | |
|-----|---|
| `w` `a` `s` `d` | slide (2048) |
| `z` `q` | up and left on an AZERTY board |
| type + `enter` | guess (word game) |
| `3` | word length: 4, 5, 6, 7, mixed |
| `1` | switch game |
| `2` | close the pane |
| `r` | new board (2048) |
| `Esc` | give the keyboard back to the prompt |
| click, or `ctrl+x` then `tab` | take the keyboard back into the pane |

W-A-S-D is a shape, not a set of letters: the same four keys under the same
fingers are Z-Q-S-D on an AZERTY board, where A and Q, W and Z are swapped.
Both are bound, so neither layout has to be told about the other. Typing a
word is layout-free either way, since a letter is a letter wherever it sits.

The pane opens by itself once a turn has run for 20 seconds, without taking
the keyboard. Press **ctrl+x tab** (or click it) to play.

`3` cycles the word length in the pane, and the choice is kept across
sessions. In `/config`: **Open after** (seconds before it opens unasked; `0`
never does), **Game** (which of the two the pane opens on) and **Word length**
(what a machine that has never chosen one plays at).

## Install

In a terminal session of Claude Code:

```
/plugin install sidequest --marketplace gdalyy/sidequest
```

Answer `y` to add the marketplace, then pick a scope — user scope makes it
available in every project, which is what you want for something that opens
while you wait. Updates arrive with `claude plugin update sidequest`.

From a local checkout instead:

```
claude plugin marketplace add /path/to/sidequest
claude plugin install sidequest@sidequest
```

or run one session with it, changing nothing on the machine:

```
claude --plugin-dir /path/to/sidequest
```

A plugin installed from a local folder runs from that folder directly: edit
it, then `/reload-plugins` in a running session.

## First run

Type `/sidequest`. The pane opens beside the transcript; press **ctrl+x** and
then **tab** to put the keyboard in it, and **Esc** to give it back. The
pane's last line always says which of the two to press.

A click focuses a pane too, but only where the terminal reports clicks, which
is its fullscreen layout. Above the prompt, in the ordinary screen, the mouse
belongs to the terminal — selecting text with it is the terminal's own job —
so the keyboard is the way in.

`ctrl+x tab` is a chord of two presses rather than one combination: ctrl+x,
released, then tab, **one straight after the other** — the chord lapses if you
pause between them, which looks exactly like a key that does nothing. Some
terminals, a JetBrains one among them, may take ctrl+x for themselves.

No letter is a control in either game. Every letter in the word game is typed
into the field, so a letter that also switched the game would swap it out from
under a word being spelled — and a key that switches one way should switch
back, which means the same key in both. `1` and `2` are those keys.

It does not take the keyboard by itself, and cannot: a pane is granted focus
only over an empty composer, and typing `/sidequest` is text in the composer.
That rule is what stops a pane opening mid-sentence and swallowing it, which
is worth more than saving a keypress here.

After that it opens by itself, twenty seconds into any turn that runs that
long, and without taking the keyboard — what you are typing still reaches the
prompt. Press **ctrl+x tab** to put the keyboard in the pane, and **Esc** to
take it back.

One thing worth knowing: a pane the engine opens **unasked** is seated only
from **144 columns**, and from 110 once you have opened it yourself at least
once. On a narrower window it waits undrawn, which looks like a plugin doing
nothing — so the plugin says so in a toast, once, rather than leaving you to
guess. `/sidequest` works at any width.

The first word game of a session takes about 25 milliseconds longer than the
rest, while the project's vocabulary is read. Nothing is sent anywhere: the
words come from `git` and the files on disk, and the plugin never calls the
model.

## Development

```
claude plugin validate .   # manifest, contract and hooks module
claude plugin test .       # 42 tests across g2048, codele and the pane
```

`hooks/g2048.ts` and `hooks/codele.ts` are the games: a board is sixteen
numbers, a word game is an answer and its guesses, and every rule is a pure
function of them, so the tests hold both games without an engine.
`hooks/register.tsx` is the hooks module: the pane, the keys and what is kept.
`types/index.d.ts` is the state contract, self-contained by rule.

## License

MIT
