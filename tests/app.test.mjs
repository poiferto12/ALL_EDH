import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCollection, sortRecommendations } from '../app.js';

test('parseCollection parses names and quantities', () => {
  const parsed = parseCollection('Sol Ring\n2x Arcane Signet\n3 Swords to Plowshares');

  assert.equal(parsed.get('sol ring'), 1);
  assert.equal(parsed.get('arcane signet'), 2);
  assert.equal(parsed.get('swords to plowshares'), 3);
});

test('sortRecommendations places owned cards first', () => {
  const cards = [
    { name: 'Card A', edhrec_rank: 1 },
    { name: 'Card B', edhrec_rank: 2 },
    { name: 'Card C', edhrec_rank: 3 }
  ];

  const collection = new Map([['card c', 1]]);
  const ordered = sortRecommendations(cards, collection);

  assert.equal(ordered[0].name, 'Card C');
});
