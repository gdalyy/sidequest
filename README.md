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
/sidequest          open it           /sidequest close   close it
```

That is the whole command surface. Both games are then played in the pane,
because a game you play by typing a command per move is not a game.

Press **ctrl+x** then **tab**, one straight after the other, to put the
keyboard in the pane. Then:

```
2048        w a s d    slide (z q s d too — the same four fingers on AZERTY)
            r          a new board
            g          go to the word game
word game   type the word, then enter
            type 2048, then enter    go back
            type new / 4 / 5 / 6 / 7 / mixed
both        m / min    roll the pane up to one line (m opens it again)
            Esc        give the keyboard back to the prompt
            ctrl+x x   close, or click the ✕ on the frame
```

Each game also draws a row of buttons, which carry no keys at all:

```
2048   [ Word game ]  [ New board ]  [ Minimize ]  [ Close ]
Word   5 letters  [ 2048 ]  [ New word ]  [ Minimize ]  [ Close ]
```

A button with no `hotkey` cannot be pressed by accident, which is why close
and switch-game are safe here and nowhere else. **A click reaches them only in
the fullscreen layout**: on the main screen Claude Code never turns mouse
reporting on, so there they draw but do not answer. Every one has a keyboard
route, so nothing depends on it.

### It follows the wait

The game opens by itself once a turn has run **20 seconds** (`Open after` in
`/config`; `0` never opens it unasked), and **rolls up to one line the moment
Claude is done**:

```
▸ Sidequest · 2048 · score 24   [ Open ]  [ Close ]
```

Rolled up, not closed: the board, the score and the word are kept, `m` opens
it again, and the next wait rolls it down with the game where you left it.

### If the buttons do nothing when you click them

Your session is on the main screen, where Claude Code never turns mouse
reporting on — no click reaches any pane. Measured both ways on live
sessions; the one setting that changes it is:

```json
"env": { "CLAUDE_CODE_NO_FLICKER": "1" }
```

in `~/.claude/settings.json`. That turns on the fullscreen layout, which
brings mouse reporting *and* docks the pane beside the transcript instead of
above the prompt. The trade-off is the usual one for a fullscreen TUI: the
terminal's own scrollback no longer holds the session.

The keys work on either layout.

### Opening a rolled-up game

`/sidequest`, or `ctrl+x` `tab` and then `m`. Not `m` on its own: a hotkey
presses only while the pane holds the keyboard and never from the composer,
so `m` at the prompt just types an m.

### If Esc puts the cursor in your editor (JetBrains)

Then Esc is never reaching Claude Code. PhpStorm, IntelliJ and the rest bind
**Escape** to *Switch Focus to Editor* in the terminal tool window, and the IDE
takes the key first. No plugin can see it, so no plugin can fix it.

**Settings → Tools → Terminal**, then depending on your version:

- 2025.2 and later — turn off **Move focus to the editor with Escape**
- earlier — turn on **Override IDE shortcuts** (*use shell-specific shortcuts
  instead of IDE shortcuts when the Terminal tool window is active*)

Either one gives Escape back to the terminal. The trade-off, reported by
JetBrains users: with the override on, `Esc`+`b`/`f` no longer walk by word in
the shell.

Until then, `m` rolls the pane up without needing Esc at all.

### Where the pane sits, and minimizing it

The engine docks a pane beside the transcript in fullscreen **from 110
columns**, and places it inline above the prompt otherwise — where it pushes
the transcript up. Widening the terminal past 110 columns moves it to the
side, and is the same condition that makes the buttons clickable.

A terminal has no `widget` seat, so the engine cannot minimize a pane there.
Instead the mod draws one line:

```
▸ Sidequest · 2048 · score 24   [ Open ]  [ Close ]
```

`m` in 2048, `min` typed in the word game, or the Minimize button. Collapsed
there is no text field in either game, so `m` opens it again from both.

### Switching game

`g` in 2048, and typing `2048` in the word game. One game is up at a time, and
the pane's title says which.

It cannot be an ordinary key in both directions: in the word game every letter
belongs to the word being spelled, and every digit needs shift on an AZERTY
board. So swapping closes the pane you are in — which is what hands the
keyboard back — and the open that follows is then eligible for the focus it
asks for, so you carry on playing without touching the prompt.

### Two rules about keys, and why

**No digit is ever a hotkey.** On an AZERTY board every digit needs shift, so
`shift+2` arrives as a plain `2` — and so does the numeric keypad. A digit is
a different physical key on every layout; a letter is the same one everywhere.
So the slides are `w a s d`, with `z q s d` bound alongside.

**Nothing of ours closes the pane.** The engine already draws a close mark on
the frame and answers `ctrl+x x`. A close key of mine, one key from the one
that switched games, was how a game shut itself while its owner was reaching
for the other one. There is none now.

**And nothing of ours ever asks for the keyboard.** A focus request is granted
only over an empty composer, and a refused one does not merely fail: measured
A/B on a real session, `ctrl+x tab` stops working afterwards — so the keys
meant for the game land in the composer, and an Enter among them sends them to
Claude as a prompt. Asking and losing is worse than never asking.

The word game binds **no key at all** — every letter there belongs to the word
being spelled, which is why switching had to stop being a key.

### When it opens by itself

Once a turn has run **20 seconds**, at its next tool call — that is the whole
rule.

In `/config`: **Open after** (seconds before the pane opens unasked; `0` means
never, so it appears only when you type `/sidequest`), **Game** (which one
opens in front) and **Word length** — what a machine that has never chosen one
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

Type `/sidequest`. The pane opens beside the transcript with 2048 in it. The
keyboard stays where it was — in the prompt. Press **ctrl+x** then **tab**,
quickly, to move it into the pane, and **Esc** to hand it back.

The pane's bottom line always says which of the two you are in: *"Playing —
w a s d slide"* when it has the keyboard, *"ctrl+x then tab, quickly, then
w a s d"* when it does not. You never have to guess.

`ctrl+x tab` is a chord of two presses rather than one combination: ctrl+x,
released, then tab, **one straight after the other** — it lapses if you pause
between them, which looks exactly like a key that does nothing. Some
terminals, a JetBrains one among them, may take `ctrl+x` for themselves.

The pane does not take the keyboard by itself, and cannot: focus is granted
only over an empty composer, and typing `/sidequest` is text in the composer.
That rule is what stops a pane opening mid-sentence and swallowing it.

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
