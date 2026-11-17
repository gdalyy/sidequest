# Changelog

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
