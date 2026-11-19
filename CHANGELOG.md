# Changelog

## 0.6.0 — 2026-11-19

**Buttons, a minimize that a terminal can actually do, and a plain answer to
"when does this thing open by itself?"**

### Buttons

Both games now draw a row of controls:

```
2048   [ Word game ]  [ New board ]  [ Minimize ]  [ Close ]
Word   5 letters  [ 2048 ]  [ New word ]  [ Minimize ]  [ Close ]
```

They were missing because I had lumped *buttons* in with *hotkeys*, and
hotkeys were the thing that burned you: a `hotkey` is a key taken out of the
terminal's mouth, which is how `shift+2` and the numeric keypad used to close
the game. **A button with no `hotkey` cannot be pressed by accident.** Close
and switch-game are safe to offer as buttons precisely because they are not
keys. I had banned the control when I only needed to ban the key.

**A click only reaches them in the fullscreen layout.** Measured on a live
session: on the main screen Claude Code never enables mouse reporting (every
`?1000/1002/1003/1006/1016` in the stream is a disable, never an enable), so
there the buttons draw but cannot be clicked. Every one of them still has a
keyboard route, so nothing depends on it.

### Minimize

The engine cannot minimize a pane in a terminal — a `widget` is a desktop-app
seat, and *"a surface with no widgets (the terminal, VS Code…) opens the pane
as if this were left out"*. So this is the mod drawing one line instead of
fourteen:

```
▸ Sidequest · 2048 · score 24   [ Open ]  [ Close ]
```

`m` rolls 2048 up and back; in the word game type `min`, or click Minimize.
Collapsed there is no text field in either game, so `m` is free to open it
again from both. Verified on a live session, both directions.

This matters most where the pane is seated **above the prompt** and pushing
the transcript up. That seat is a width rule, not a bug: the engine docks a
pane beside the transcript only in fullscreen **from 110 columns**, and places
it inline above the prompt otherwise. Widening the terminal past 110 columns
moves it to the side — and is the same condition that makes the buttons
clickable.

### When it opens by itself

After a turn has run **20 seconds**, on its next tool call. It was never
written down. It is `Open after` in `/config`, and `0` means never open
unasked.

### Also

- Switching is said first, not buried: `g: the word game · m: minimize ·
  r: new board · Esc: the prompt`.
- The game-over line still read `/sq new deals another board` — the last `/sq`
  left in the code.
- The `mode` setting still claimed `t` switches games. It has not since 0.4.0.

## 0.5.0 — 2026-11-19

**The slash commands for playing are gone, and so is every key that could
close the pane or be swallowed by a word.**

```
/sidequest          open      /sidequest close    close
```

That is the whole command surface. A game you play by typing a command per
move is not a game.

Each game is now its own pane, and one is up at a time, so the pane's title
says which you are in:

- **2048** — `w a s d` slide (`z q s d` too), `r` deals a new board, `g` goes
  to the word game.
- **Word** — type the word and press enter, or type `2048` to come back.
- **Both** — `Esc` hands the keyboard back, `ctrl+x x` or the ✕ closes.

Switching had to stop being an ordinary key, because in the word game every
letter belongs to the word being spelled and every digit needs shift on an
AZERTY board. It is now the pane itself that changes: swapping **closes the
pane you are in, which is what hands the keys back, and the open that follows
is then eligible for the focus it asks for** — so you carry on playing in the
other game without touching the prompt.

### What testing on a real session changed

Two designs died in the harness rather than in your hands:

- **Engine tabs.** Two panes draw as `│ 2048  Word │`, which looked like the
  answer. But switching by keyboard needs the focus ring to already be on the
  tab strip, and after a few slides it is not: the letters went into the
  composer instead, and the Enter among them **sent them to the model**.
- **Asking for focus on open.** The documentation says a refused focus request
  is harmless. Measured A/B on a real session, it is not — the `ctrl+x tab`
  chord stops working afterwards, with the same result: keys in the composer,
  a prompt fired at Claude. No open of ours asks for focus now, and a test
  holds that.

Verified end to end on a pty: `ctrl+x tab` took the keyboard, `w a s d` played
the board, `g` reached the word game, a guess of the right length was graded,
typing `2048` came back, `Esc` handed the keyboard back in one press, and
nothing reached the prompt or the model.

### Also fixed

- **Esc gives the keyboard back from the word game** in one press.
- The opening line still said *"The keyboard never leaves the prompt"*, left
  over from 0.3.0 and untrue since 0.4.0.
- `mode` in `/config` now chooses which game comes up rather than which one
  exists.

## 0.4.0 — 2026-11-19

**You play with the keys again.** 0.3.0 threw out the hotkeys to stop the pane
closing itself. That was an overcorrection: the bug report proved the keys
*were* reaching the pane — `shift+2` really did close it — so the channel was
never broken. The bindings were. Typing `/sq` for every move was not a fix.

So the keys are back, under two rules that make the old bug impossible:

- **No digit is ever a hotkey.** A digit needs shift on an AZERTY board, so
  `shift+2` and the numeric keypad both arrive as a plain `2`. A letter is the
  same physical key everywhere. 2048 slides on `w a s d`, with `z q s d` bound
  alongside — the same four fingers on an AZERTY board — plus `r` for a new
  board and `g` for the word game.
- **Nothing of ours closes the pane.** The engine already draws a close mark
  on the frame and answers `ctrl+x x`. A second way out, one key from the one
  that switches games, is how a game shuts itself while its owner reaches for
  the other. There is no close hotkey, in either game.

The word game binds **no key at all** — every letter there belongs to the word
being spelled. Its text field takes the controls instead: type the word to
guess, or `2048`, `new`, `4`–`7`, `mixed`. One surface, nothing to collide.

The pane's bottom line now says which of the two you are in — *"Playing —
w a s d slide"* or *"ctrl+x then tab… or /sq d from the prompt"* — so the
focus state is never something to guess at.

Everything 0.3.0 added from the prompt stays, as the way that needs no focus:
`/sq`, runs of moves (`/sq ddss`), and `2048`/`word` naming a game outright
with `next` as the toggle.

Driven through a real session on a pty: `ctrl+x tab` took the keyboard, twelve
`w a s d` presses played the board (the kept best rose 4 → 8 → 76 across runs
of 5 and 16 presses, and stayed put on a run with none), `g` reached the word
game, a typed `parse` was graded, and a typed `2048` came back to the board.

## 0.3.0 — 2026-11-18

**The pane binds no key at all, and never asks for the keyboard.**

0.2.0 moved play to the prompt but left the pane's hotkeys in place, and those
were the bug. A hotkey in a pane is a key taken out of the terminal's mouth,
and the pane cannot know what was meant by it:

- `2` meant **close** in *both* games. On an AZERTY board a digit needs shift,
  so `shift+2` — reaching for the other game — arrived as `2` and shut the
  pane. So did the numeric keypad.
- `1` meant **switch**, but in the word game the text field took the digit
  first, so there was no way back to 2048 once you had left it.
- Esc belonged to the terminal and the editor, never to a pane that had not
  been granted focus, so it did whatever that editor does — in a JetBrains
  terminal, jump to an open file.

Every `hotkey` is gone, and `$.ui.open` no longer requests `focus`. The
buttons stay and still answer a click where the terminal reports one.

Added, so that playing from the prompt is actually pleasant:

- **`/sq`**, the same command under a name short enough to play with. `/sq d`
  is five keystrokes where `/sidequest d` was twelve.
- **Runs of moves** — `/sq ddss` slides four times in one go.
- **`/sq 2048` and `/sq word` name a game** rather than toggling, so asking
  twice for the one already showing is harmless and neither can strand you.
  `/sq next` is the toggle, for when either will do.

Driven through a real session on a pty: `/sq ddss` scored, `/sq word`,
`/sq parse` graded, `/sq 2048` came back to the same board — and mashing
`1 2 3 r t` and Esc with the pane open moved nothing but the cursor in the
prompt.

## 0.2.0 — 2026-11-18

Both games are played **from the prompt**, where the keyboard already is.

Reaching into the pane meant taking the keyboard from the composer, and that
turned out to be the one thing neither the plugin nor the person could rely
on: the focus request is refused over a composer holding text, the `ctrl+x`
`tab` chord lapses unless the two presses are quick, a terminal reports no
click outside its fullscreen layout, and on an AZERTY board a digit needs
shift. A slash command is answered every time, whatever holds the keyboard and
however it is laid out.

- `/sidequest w a s d` slides 2048 (`z` and `q` too), and the reply says the
  score.
- `/sidequest <word>` guesses, and the reply grades it letter by letter:
  `P· A· R· S· E~`.
- `/sidequest 2048` and `/sidequest word` switch, `/sidequest new` deals
  again, `/sidequest 4`…`7` or `mixed` sets the length, `/sidequest close`
  closes.
- The pane still plays directly where the keyboard does reach it. It is the
  faster way round when it works, and no longer the only one.

## 0.1.7 — 2026-11-18

- Every letter of a guess carries its own mark — `T=` in place, `E~` elsewhere,
  `S·` not in the word — so a guess is one row and reads with no colour at all.
  A terminal is free to draw two theme hues so alike that green and amber
  cannot be told apart, and then colour alone says nothing.
- No letter is a control in either game. `1` switches game and `2` closes,
  the same keys in both, so the key that switched never fails to switch back.
- `3` cycles the word length from the pane — 4, 5, 6, 7, mixed — and the choice
  outlives the session. The setting is what a machine that has never chosen
  one plays at.

## 0.1.6 — 2026-11-18

- `/sidequest` says one thing: how to reach the pane. The keys are drawn in
  the pane itself, and repeating them in the transcript only buried the one
  thing that was not.
- The marks under each guess give way where the room is short. A guess is two
  rows with them, so six guesses no longer fitted and the earliest scrolled
  out of sight; the colour carries a guess alone when it has to.
- The pane no longer offers a click. A terminal reports clicks only in its
  fullscreen layout, and naming a way in that does nothing is worse than
  naming none.

## 0.1.5 — 2026-11-18

- A graded guess colours the letters themselves rather than painting a block
  behind them. The terminal was not painting the background, so every letter of
  a guess looked alike and the guess said nothing.
- Under each guess is a row of marks — `=` in place, `~` elsewhere, `·` not in
  the word — which carries the same answer without colour, for a terminal with
  none and for anyone who cannot tell green from amber.
- A letter ruled out is struck through rather than only dimmed, and the letters
  still worth trying are listed in words beneath. A terminal may draw `dim` in
  any shade it likes, and where that shade is warmer than the plain text the
  eliminated letters were the ones catching the eye.

## 0.1.4 — 2026-11-18

- The word game's controls move to `1` and `2`. They were `t` and `x`, which
  are letters, and every letter there is typed into the guess: spelling a word
  holding a t swapped the game out from under it.
- The hint says the chord must be two quick presses. Driven in a real terminal,
  `ctrl+x` then `tab` focuses the pane only when the second key follows at
  once; a pause lets the chord lapse, which looks like a key doing nothing.

## 0.1.3 — 2026-11-18

- The pane says `click here, or ctrl+x then tab, to play`. It had said
  `ctrl+x tab`, which reads as one combination and is two presses, and said
  nothing of the click that does the same thing — the way in where a terminal
  keeps ctrl+x for itself, as a JetBrains one does.

## 0.1.2 — 2026-11-18

- The pane asks for the rows 2048 needs whole. Opened inline above the prompt
  it was given about six, so nine rows of board could not fit however compact
  the rest became.
- Where the layout cannot spare them anyway, the pane sheds what is not the
  game — the note about AZERTY keys goes first — rather than letting the board
  scroll out of sight.

## 0.1.1 — 2026-11-18

- Each game is drawn to fit the rows a pane is given. Both were taller than an
  inline pane, so the header and most of the board scrolled out of sight and
  the controls fell off the bottom.
- The pane's last line says which key reaches it: `ctrl+x tab` while the prompt
  holds the keyboard, `Esc` while the pane does.
- `/sidequest` no longer claims to have taken the keyboard. It cannot: a pane
  is granted focus only over an empty composer, and typing the command is text
  in the composer.
- A window too narrow to seat an unasked pane is said once, with the engine's
  own reason, rather than looking like a plugin that does nothing.

## 0.1.0 — 2026-11-18

- A pane beside the chat, opened by itself once a turn has run 20 seconds and
  without taking the keyboard, so what you are typing still reaches the prompt.
  Its first line doubles as the progress indicator: `Claude is working · 7 steps`.
- **2048**, with the best score kept across sessions. `w a s d`, and `z q s d`
  for the same four keys on an AZERTY board.
- **Codele**, a word game whose answers are harvested from the project itself —
  its source, its markdown and its commit messages. Reserved words of eleven
  languages, English filler, URLs, hashes and words used only once are all held
  back, so an answer is a word about the work. Playable at 4, 5, 6, 7 letters
  or mixed; the last 60 answers never repeat.
- Settings: when the pane opens unasked, which game it opens on, word length.
