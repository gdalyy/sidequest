import { expect, test } from 'claude-code/testing'

import { canMove, draw, highest, move, newBoard, play, slide, spawn } from './g2048'

const fixed = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}

test('a line slides to its head', () => {
  expect(slide([0, 2, 0, 4]).line).toEqual([2, 4, 0, 0])
  expect(slide([0, 0, 0, 0]).line).toEqual([0, 0, 0, 0])
  expect(slide([2, 4, 8, 16]).line).toEqual([2, 4, 8, 16])
})

test('equal neighbours merge once, and the merge scores', () => {
  const merged = slide([2, 2, 0, 0])
  expect(merged.line).toEqual([4, 0, 0, 0])
  expect(merged.gained).toBe(4)

  // two pairs merge, and the new 4 does not merge again in the same move
  const twice = slide([2, 2, 2, 2])
  expect(twice.line).toEqual([4, 4, 0, 0])
  expect(twice.gained).toBe(8)

  // the head pair merges; the odd tile follows
  expect(slide([4, 4, 4, 0]).line).toEqual([8, 4, 0, 0])
})

test('a move slides every row or column the right way', () => {
  // prettier-ignore
  const cells = [
    2, 0, 0, 2,
    0, 0, 0, 0,
    4, 4, 0, 0,
    0, 0, 0, 0,
  ]
  expect(move(cells, 'left').cells.slice(0, 4)).toEqual([4, 0, 0, 0])
  expect(move(cells, 'right').cells.slice(0, 4)).toEqual([0, 0, 0, 4])
  expect(move(cells, 'left').cells.slice(8, 12)).toEqual([8, 0, 0, 0])

  // a column: the two 2s at the ends of column 0 come together at the top
  const column = move([2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0], 'up')
  expect(column.cells[0]).toBe(4)
  expect(column.gained).toBe(4)
})

test('a move that changes nothing says so', () => {
  // prettier-ignore
  const packed = [
    2, 4, 8, 16,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]
  expect(move(packed, 'left').hasMoved).toBe(false)
  expect(move(packed, 'down').hasMoved).toBe(true)
})

test('a new board holds two tiles and nothing else', () => {
  const board = newBoard(fixed([0.1, 0.5, 0.6, 0.2]))
  expect(board.cells.filter(v => v !== 0).length).toBe(2)
  expect(board.cells.every(v => v === 0 || v === 2 || v === 4)).toBe(true)
  expect(board.score).toBe(0)
  expect(board.isOver).toBe(false)
})

test('a turn that moves drops one new tile; a turn that does not, does not', () => {
  const board = { cells: [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 0, best: 0, isOver: false }
  const after = play(board, 'left', fixed([0.5, 0.1]))
  expect(after.score).toBe(4)
  expect(after.cells.filter(v => v !== 0).length).toBe(2)

  // nothing slides left here, so the board is handed back untouched
  const stuck = { cells: [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 9, best: 9, isOver: false }
  expect(play(stuck, 'left', fixed([0.5]))).toEqual(stuck)
})

test('the best score survives a worse game', () => {
  const board = { cells: [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 0, best: 900, isOver: false }
  expect(play(board, 'left', fixed([0.5, 0.1])).best).toBe(900)
})

test('a full board with no pair left is over', () => {
  // prettier-ignore
  const dead = [
    2, 4, 2, 4,
    4, 2, 4, 2,
    2, 4, 2, 4,
    4, 2, 4, 2,
  ]
  expect(canMove(dead)).toBe(false)

  // the same board with one pair touching is not
  const alive = [...dead]
  alive[15] = 4
  expect(canMove(alive)).toBe(true)
})

test('highest reads the tile a player brags about', () => {
  expect(highest([2, 4, 128, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(128)
  expect(highest(new Array(16).fill(0))).toBe(0)
})

test('the drawing is a square grid that fits the pane', () => {
  const rows = draw([2, 0, 0, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  expect(rows.length).toBe(9)
  for (const row of rows) expect(row.length).toBe(29)
  expect(rows[1]).toContain('2')
  expect(rows[1]).toContain('1024')
})
