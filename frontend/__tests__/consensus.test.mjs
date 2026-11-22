// Pure consensus rules of the room page (an ES module).
import { consensusLevel, consensusLevelFromVotes, consensusLabelKey, reactionsFor, REACTION_SETS } from '../public/js/room/consensus.js';

const stats = (distribution, extra = {}) => ({
  distribution,
  allSame: Object.keys(distribution).length === 1,
  ...extra,
});

describe('consensusLevel (server stats)', () => {
  test.each([
    ['no stats', null, 'neutral'],
    ['everyone the same', stats({ 5: 4 }, { min: 5, max: 5 }), 'full'],
    ['80% agree', stats({ 5: 4, 8: 1 }, { min: 5, max: 8 }), 'near'],
    ['coffee run', stats({ '☕': 2, 3: 1, 13: 2 }, { min: 3, max: 13 }), 'coffee'],
    ['many question marks', stats({ '?': 2, 3: 1, 13: 2 }, { min: 3, max: 13 }), 'question'],
    ['close together', stats({ 3: 2, 5: 2 }, { min: 3, max: 5 }), 'close'],
    ['spread out', stats({ 1: 2, 13: 2 }, { min: 1, max: 13 }), 'spread'],
    ['only T-shirt sizes, mixed', stats({ M: 2, L: 2 }), 'neutral'],
  ])('%s → %s', (_label, input, expected) => {
    expect(consensusLevel(input)).toBe(expected);
  });
});

describe('consensusLevelFromVotes (history)', () => {
  test.each([
    ['empty', {}, 'neutral'],
    ['all equal', { a: '8', b: '8' }, 'full'],
    ['ignores missing votes', { a: '8', b: null, c: '8' }, 'full'],
    ['close numbers (range ≤ 2)', { a: '2', b: '3', c: '4' }, 'close'],
    ['range of 3 is spread', { a: '2', b: '3', c: '5' }, 'spread'],
    ['half counts as number', { a: '½', b: '2' }, 'close'],
    ['spread numbers', { a: '1', b: '21' }, 'spread'],
    ['only sizes', { a: 'S', b: 'XL' }, 'neutral'],
    ['coffee majority', { a: '☕', b: '☕', c: '3', d: '13', e: '21' }, 'coffee'],
  ])('%s → %s', (_label, votes, expected) => {
    expect(consensusLevelFromVotes(votes)).toBe(expected);
  });
});

test('label keys map to i18n entries, none for neutral', () => {
  expect(consensusLabelKey('full')).toBe('room.analytics.consensus_full');
  expect(consensusLabelKey('neutral')).toBe('');
});

test('every level offers five reactions, unknown falls back to neutral', () => {
  for (const set of Object.values(REACTION_SETS)) expect(set).toHaveLength(5);
  expect(reactionsFor('nope')).toBe(REACTION_SETS.neutral);
});
