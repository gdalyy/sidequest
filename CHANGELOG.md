# Changelog

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
