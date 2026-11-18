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

Type `/sq` to open the pane, then **ctrl+x** and **tab**, one straight after
the other, to put the keyboard in it. After that you just play:

```
2048            w a s d   slide (z q s d too, same four fingers on AZERTY)
                r         new board
                g         go to the word game
word game       type the word, enter
                type 2048, enter   go back
                type new / 4 / 5 / 6 / 7 / mixed, enter
both            Esc       give the keyboard back to the prompt
                ctrl+x x  close the pane, or click the ✕ on its frame
```

**No digit is bound to anything, and nothing of ours closes the pane.** Those
two rules are the whole design, and the section below says why.

The word game has no hotkeys at all — its text field takes the controls as
well as the guesses, because every letter there belongs to the word you are
spelling.

### Or from the prompt, without touching focus

Every one of those also works as a command, for when the pane does not have
the keyboard and you would rather not go and get it:

```
/sq            open          /sq new        another board, or word
/sq w a s d    slide         /sq 4 5 6 7    letters wanted   /sq mixed
/sq ddss       a run of them /sq word       the word game
/sq parse      guess         /sq 2048       2048    /sq next  the other one
/sq close      close
```

```
> /sq ddss
  Slid right, right, down, down. Score 8.

> /sq parse
  P· A· R· S· E~ — guess 2 of 6.
```

`2048` and `word` name a game outright rather than toggling, so asking twice
for the one already showing does nothing and neither can strand you.
`/sidequest` is the same command spelled out, for finding it in the menu.

### Why not just play the pane

### Two rules about keys, and why

**No digit is ever a hotkey.** On an AZERTY board every digit needs shift, so
`shift+2` arrives as a plain `2` — and so does the numeric keypad. A digit is
a different physical key on every layout; a letter is the same one everywhere.
So the slides are `w a s d`, with `z q s d` bound alongside them, which is the
same four fingers on an AZERTY board.

**Nothing of ours closes the pane.** The engine already draws a close mark on
the frame and answers `ctrl+x x`. A second way out, one key away from the one
that switches games, is not a convenience — it is a game that shuts itself
while its owner reaches for the other one. There is no close hotkey.

The remaining trouble is only *getting* the keyboard. A pane is granted focus
only over an empty composer, and typing `/sq` is text in the composer, so the
pane never asks — you take it with `ctrl+x tab`, two presses one straight
after the other, and `Esc` hands it back. The chord lapses if you pause
between them, which looks exactly like a key that does nothing. Some
terminals, a JetBrains one among them, may take `ctrl+x` for themselves.

That is why the slash command exists as well, and why it does everything the
keys do. A click works too, but only where the terminal reports clicks, which
is its fullscreen layout — above the prompt the mouse belongs to the terminal.

In `/config`: **Open after** (seconds before the pane opens unasked; `0` never
does), **Game** and **Word length** — what a machine that has never chosen one
starts at.

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

Type `/sq`. The pane opens beside the transcript, and the keyboard stays where
it was — in the prompt. Press **ctrl+x** then **tab**, quickly, to move it into
the pane, and **Esc** to hand it back.

The pane's bottom line always says which of the two you are in: *"Playing —
w a s d slide"* when it has the keyboard, and *"ctrl+x then tab… or /sq d from
the prompt"* when it does not. You never have to guess.

The pane does not take the keyboard by itself, and cannot: focus is granted
only over an empty composer, and typing `/sq` is text in the composer. That
rule is what stops a pane opening mid-sentence and swallowing it, which is
worth more than saving a keypress.

After that it opens by itself, twenty seconds into any turn that runs that
long, and without taking the keyboard — what you are typing still reaches the
prompt.

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
