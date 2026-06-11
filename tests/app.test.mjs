import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCollection,
  sortRecommendations,
  formatDeckList,
} from "../app.js";

import {
  buildConsistentNonLandDeck,
  improveDeckWithSwaps,
  scoreWholeDeck,
} from "../scoring.js";

test("parseCollection interpreta nombres y cantidades", () => {
  const collection = parseCollection(`
    Sol Ring
    2x Arcane Signet
    3 Swords to Plowshares
  `);

  assert.equal(
    collection.get("sol ring"),
    1
  );

  assert.equal(
    collection.get("solring"),
    1
  );

  assert.equal(
    collection.get("arcane signet"),
    2
  );

  assert.equal(
    collection.get("arcanesignet"),
    2
  );

  assert.equal(
    collection.get("swords to plowshares"),
    3
  );

  assert.equal(
    collection.get("swordstoplowshares"),
    3
  );
});

test("sortRecommendations coloca primero las cartas de la colección", () => {
  const cards = [
    {
      name: "Sol Ring",
      edhrec_rank: 1,
    },
    {
      name: "Arcane Signet",
      edhrec_rank: 2,
    },
    {
      name: "Swords to Plowshares",
      edhrec_rank: 3,
    },
  ];

  const collection = new Map([
    ["swordstoplowshares", 1],
  ]);

  const ordered =
    sortRecommendations(
      cards,
      collection
    );

  assert.equal(
    ordered[0].name,
    "Swords to Plowshares"
  );
});

const emptyCommanderProfile = {
  tribes: new Set(),
  mechanics: new Set(),
  colors: ["G"],
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
  careAboutPing: false,
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
    type_line: "Sorcery",
    colors: ["G"],
    prices: {
      usd: "0.25",
    },
    edhrec_rank: 1000,
  };
}

test("el constructor cubre los déficits funcionales más urgentes", () => {
  const candidates = [
    createTestCard(
      "Cultivate",
      "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand."
    ),

    createTestCard(
      "Rampant Growth",
      "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle."
    ),

    createTestCard(
      "Harmonize",
      "Draw three cards.",
      4
    ),

    createTestCard(
      "Beast Within",
      "Destroy target permanent its controller controls."
    ),

    createTestCard(
      "Giant Growth",
      "Target creature gets +3/+3 until end of turn."
    ),

    createTestCard(
      "Overcome",
      "Creatures you control get +2/+2 and gain trample until end of turn.",
      5
    ),
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
        recursion: 0,
      },
      collectionCounts: new Map(),
      commanderProfile:
        emptyCommanderProfile,
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
});

test("el constructor no modifica las cartas candidatas originales", () => {
  const candidates = [
    createTestCard(
      "Cryptic Command",
      "Counter target spell. Draw a card.",
      4
    ),
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
        recursion: 0,
      },
      collectionCounts: new Map(),
      commanderProfile:
        emptyCommanderProfile,
    });

  assert.equal(
    candidates[0]._assignedRole,
    undefined
  );

  assert.ok(
    ["draw", "protection"].includes(
      result.cards[0]._assignedRole
    )
  );
});

test("scoreWholeDeck premia la cobertura de roles", () => {
  const weakDeck = [
    createTestCard(
      "Giant Growth",
      "Target creature gets +3/+3 until end of turn."
    ),
    createTestCard(
      "Overcome",
      "Creatures you control get +2/+2 and gain trample until end of turn.",
      5
    ),
  ];

  const balancedDeck = [
    createTestCard(
      "Cultivate",
      "Search your library for a basic land card, put it onto the battlefield tapped."
    ),
    createTestCard(
      "Harmonize",
      "Draw three cards.",
      4
    ),
    createTestCard(
      "Beast Within",
      "Destroy target permanent."
    ),
  ];

  const roleTargets = {
    ramp: 1,
    draw: 1,
    removal: 1,
    wipe: 0,
    tutor: 0,
    protection: 0,
    recursion: 0,
  };

  const weakScore =
    scoreWholeDeck({
      cards: weakDeck,
      roleTargets,
      commanderProfile:
        emptyCommanderProfile,
    }).total;

  const balancedScore =
    scoreWholeDeck({
      cards: balancedDeck,
      roleTargets,
      commanderProfile:
        emptyCommanderProfile,
    }).total;

  assert.ok(
    balancedScore > weakScore
  );
});

test("improveDeckWithSwaps mejora o conserva la puntuación global", () => {
  const initialDeck = [
    createTestCard(
      "Giant Growth",
      "Target creature gets +3/+3 until end of turn."
    ),
    createTestCard(
      "Overcome",
      "Creatures you control get +2/+2 and gain trample until end of turn.",
      5
    ),
    createTestCard(
      "Titanic Growth",
      "Target creature gets +4/+4 until end of turn."
    ),
  ];

  const candidates = [
    ...initialDeck,
    createTestCard(
      "Cultivate",
      "Search your library for a basic land card, put it onto the battlefield tapped."
    ),
    createTestCard(
      "Harmonize",
      "Draw three cards.",
      4
    ),
    createTestCard(
      "Beast Within",
      "Destroy target permanent."
    ),
  ];

  const roleTargets = {
    ramp: 1,
    draw: 1,
    removal: 1,
    wipe: 0,
    tutor: 0,
    protection: 0,
    recursion: 0,
  };

  const before =
    scoreWholeDeck({
      cards: initialDeck,
      roleTargets,
      commanderProfile:
        emptyCommanderProfile,
    }).total;

  const improved =
    improveDeckWithSwaps({
      deck: initialDeck,
      candidates,
      roleTargets,
      commanderProfile:
        emptyCommanderProfile,
      collectionCounts: new Map(),
      maxBudget: 0,
      landCost: 0,
      maxPasses: 3,
      candidateLimit: 10,
    });

  assert.equal(
    improved.cards.length,
    initialDeck.length
  );

  assert.ok(
    improved.score >= before
  );

  assert.ok(
    improved.swaps >= 1
  );
});

test("formatDeckList agrupa copias y coloca el comandante arriba", () => {
  const commander = {
    name: "Muldrotha, the Gravetide",
  };

  const cards = [
    {
      name: "Forest",
    },
    {
      name: "Forest",
    },
    {
      name: "Sol Ring",
    },
  ];

  const output =
    formatDeckList(
      commander,
      cards
    );

  assert.ok(
    output.startsWith(
      "1 Muldrotha, the Gravetide"
    )
  );

  assert.match(
    output,
    /2 Forest/
  );

  assert.match(
    output,
    /1 Sol Ring/
  );
});