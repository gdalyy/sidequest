/**
 * The contract: self-contained by rule, so every type a drawing or a stored
 * value needs is declared here and imported from here, never the other way.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

/** How one guessed letter stands: in place, elsewhere in the word, or not in it. */
export type Grade = 'right' | 'near' | 'absent'

/** A candidate answer and where it came from. */
export type WordSource = { word: string; from: string }

export type Codele = {
  /** The answer, five lowercase letters. */
  word: string
  /** Where the answer came from: this project, its language, or programming. */
  from: string
  /** How many letters this game is played at; the board is drawn to it. */
  length: number
  guesses: string[]
  isDone: boolean
  isWon: boolean
}

export type Board = {
  /** 16 cells, row-major, 0 for an empty one. */
  cells: number[]
  score: number
  /** The best this machine has seen, kept across sessions. */
  best: number
  /** True once no move changes the board. */
  isOver: boolean
}

declare module 'claude-code' {
  interface PluginState {
    sidequest: {
      /** Whether a turn is running: what the pane's header says. */
      isWorking: boolean
      /** How many tool calls this turn has made, shown while it runs. */
      steps: number
      board: Shaped<Board>
      codele: Shaped<Codele | null>
      /** The word length asked for: '4'…'7' or 'mixed', cycled from the pane. */
      wanted: string
      /**
       * Whether the pane is rolled up to its one-line form. A terminal has no
       * widget seat, so the engine cannot minimize a pane; this is the mod
       * drawing one line instead of fourteen, which is the same thing where
       * the pane is seated above the prompt and pushing the transcript up.
       */
      isMini: boolean
    }
  }
}
