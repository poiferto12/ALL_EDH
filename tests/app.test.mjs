import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCollection,
  sortRecommendations
} from '../app.js';

import {
  buildConsistentNonLandDeck
} from '../scoring.js';

test(
  'parseCollection interpreta nombres y cantidades',
  () => {
    const collection = parseCollection(`
      Sol Ring
      2x Arcane Signet
      3 Swords to Plowshares
    `);

    assert.equal(
      collection.get('sol ring'),
      1
    );

    assert.equal(
      collection.get('arcane signet'),
      2
    );

    assert.equal(
      collection.get('swords to plowshares'),
      3
    );
  }
);

test(
  'sortRecommendations coloca primero las cartas de la colección',
  () => {
    const cards = [
      {
        name: 'Sol Ring',
        edhrec_rank: 1
      },
      {
        name: 'Arcane Signet',
        edhrec_rank: 2
      },
      {
        name: 'Swords to Plowshares',
        edhrec_rank: 3
      }
    ];

    const collection = new Map([
      ['swords to plowshares', 1]
    ]);

    const ordered = sortRecommendations(
      cards,
      collection
    );

    assert.equal(
      ordered[0].name,
      'Swords to Plowshares'
    );
  }
);

const emptyCommanderProfile = {
  tribes: new Set(),
  mechanics: new Set(),
  colors: ['G'],
  careAboutCreatureType: false,
  careAboutSpells: false,
  careAboutGraveyard: false,
  careAboutTokens: false,
  careAboutCounters: false,
  careAboutArtifacts: false,
  careAboutEnchantments: false,
  careAboutLandfall: false,
  careAboutLifegain: false,
  careAboutSacrifice: false,
  careAboutETB: false,
  careAboutEquipment: false,
  careAboutPing: false
};

function createTestCard(
  name,
  oracleText,
  cmc = 2
) {
  return {
    name,
    oracle_text: oracleText,
    cmc,
    type_line: 'Sorcery',
    colors: ['G'],
    prices: {
      usd: '0.25'
    },
    edhrec_rank: 1000
  };
}

test(
  'el constructor cubre los déficits funcionales más urgentes',
  () => {
    const candidates = [
      createTestCard(
        'Cultivate',
        'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand.'
      ),
      createTestCard(
        'Rampant Growth',
        'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.'
      ),
      createTestCard(
        'Harmonize',
        'Draw three cards.',
        4
      ),
      createTestCard(
        'Beast Within',
        'Destroy target permanent its controller controls.'
      ),
      createTestCard(
        'Giant Growth',
        'Target creature gets +3/+3 until end of turn.'
      ),
      createTestCard(
        'Overcome',
        'Creatures you control get +2/+2 and gain trample until end of turn.',
        5
      )
    ];

    const result =
      buildConsistentNonLandDeck({
        cards: candidates,
        targetCount: 4,
        roleTargets: {
          ramp: 2,
          draw: 1,
          removal: 1,
          wipe: 0,
          tutor: 0,
          protection: 0,
          recursion: 0
        },
        collectionCounts: new Map(),
        commanderProfile:
          emptyCommanderProfile
      });

    assert.equal(
      result.cards.length,
      4
    );

    assert.equal(
      result.roleCounts.ramp,
      2
    );

    assert.equal(
      result.roleCounts.draw,
      1
    );

    assert.equal(
      result.roleCounts.removal,
      1
    );
  }
);

test(
  'el constructor no modifica las cartas candidatas originales',
  () => {
    const candidates = [
      createTestCard(
        'Cryptic Command',
        'Counter target spell. Draw a card.',
        4
      )
    ];

    const result =
      buildConsistentNonLandDeck({
        cards: candidates,
        targetCount: 1,
        roleTargets: {
          ramp: 0,
          draw: 1,
          removal: 0,
          wipe: 0,
          tutor: 0,
          protection: 1,
          recursion: 0
        },
        collectionCounts: new Map(),
        commanderProfile:
          emptyCommanderProfile
      });

    assert.equal(
      candidates[0]._assignedRole,
      undefined
    );

    assert.ok(
      ['draw', 'protection'].includes(
        result.cards[0]._assignedRole
      )
    );
  }
);