// scoring.js - Sistema de puntuación para Commander

// ---------- UTIL ----------
export function normalizeCardName(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ---------- TIPOS DE CRIATURA ----------
const CREATURE_TYPES = new Set([
  'angel',
  'demon',
  'dragon',
  'zombie',
  'vampire',
  'elf',
  'goblin',
  'merfolk',
  'ally',
  'wizard',
  'warrior',
  'knight',
  'cleric',
  'rogue',
  'shaman',
  'druid',
  'monk',
  'beast',
  'bird',
  'cat',
  'dinosaur',
  'elemental',
  'faerie',
  'giant',
  'golem',
  'human',
  'hydra',
  'insect',
  'minotaur',
  'phoenix',
  'pirate',
  'plant',
  'rat',
  'saproling',
  'serpent',
  'skeleton',
  'sliver',
  'soldier',
  'sphinx',
  'spirit',
  'treefolk',
  'wolf',
  'wurm',
  'construct',
  'horror',
  'illusion',
  'kithkin',
  'leviathan',
  'ooze',
  'pegasus',
  'praetor',
  'shade',
  'shapeshifter',
  'spawn',
  'specter',
  'thrull',
  'troll',
  'unicorn',
  'archer',
  'assassin',
  'berserker',
  'centaur',
  'djinn',
  'dryad',
  'fungus',
  'gorgon',
  'homunculus',
  'imp',
  'kavu',
  'lizard',
  'ninja',
  'ogre',
  'orc',
  'scorpion',
  'spider',
  'squid',
  'turtle',
  'naga',
  'viashino',
  'vedalken',
  'gnome',
  'mutant',
  'avatar'
]);

// ---------- MECÁNICAS ----------
const MECHANIC_GROUPS = [
  {
    pattern: /\bally\b/i,
    group: 'ally'
  },
  {
    pattern: /\+1\/\+1 counter/i,
    group: 'counters'
  },
  {
    pattern: /proliferate/i,
    group: 'counters'
  },
  {
    pattern: /create.*token/i,
    group: 'tokens'
  },
  {
    pattern: /populate/i,
    group: 'tokens'
  },
  {
    pattern: /\bsacrifice\b/i,
    group: 'sacrifice'
  },
  {
    pattern: /when.*dies/i,
    group: 'sacrifice'
  },
  {
    pattern: /graveyard/i,
    group: 'graveyard'
  },
  {
    pattern: /flashback|unearth|escape/i,
    group: 'graveyard'
  },
  {
    pattern: /whenever you cast/i,
    group: 'spells'
  },
  {
    pattern: /magecraft/i,
    group: 'spells'
  },
  {
    pattern: /copy.*spell/i,
    group: 'spells'
  },
  {
    pattern: /when.*enters/i,
    group: 'etb'
  },
  {
    pattern: /flicker|blink/i,
    group: 'blink'
  },
  {
    pattern: /\bequip\b|equipment/i,
    group: 'equipment'
  },
  {
    pattern: /enchant creature|aura/i,
    group: 'auras'
  },
  {
    pattern: /gain.*life|lifelink/i,
    group: 'lifegain'
  },
  {
    pattern: /whenever.*gain.*life/i,
    group: 'lifegain'
  },
  {
    pattern: /draw.*card/i,
    group: 'draw'
  },
  {
    pattern: /wheel.*each player draws/i,
    group: 'wheels'
  },
  {
    pattern: /add \{[WUBRGC]/i,
    group: 'ramp'
  },
  {
    pattern: /search.*land/i,
    group: 'ramp'
  },
  {
    pattern: /\bartifact\b/i,
    group: 'artifacts'
  },
  {
    pattern: /treasure/i,
    group: 'treasure'
  },
  {
    pattern: /\benchantment\b/i,
    group: 'enchantments'
  },
  {
    pattern: /constellation/i,
    group: 'enchantments'
  },
  {
    pattern: /whenever.*attacks/i,
    group: 'attack-triggers'
  },
  {
    pattern: /additional combat/i,
    group: 'combat'
  },
  {
    pattern: /landfall/i,
    group: 'landfall'
  },
  {
    pattern: /\bmill\b/i,
    group: 'mill'
  },
  {
    pattern: /deals.*damage.*each/i,
    group: 'ping'
  },
  {
    pattern: /whenever.*deals damage/i,
    group: 'ping'
  }
];

// ---------- STAPLES UNIVERSALES ----------
const UNIVERSAL_STAPLES = new Set([
  'solring',
  'arcanesignet',
  'commandtower',
  'lightninggreaves',
  'swiftfootboots',
  'swordstoplowshares',
  'pathtoexile',
  'counterspell',
  'cyclonicrift',
  'demonictutor',
  'vampirictutor',
  'rhysticstudy',
  'smotheringtithe',
  'docksideextortionist',
  'fierceguardianship',
  'deflectingswat',
  'deadlyrollick',
  'jeskaswill',
  'espersentinel',
  'manacrypt',
  'manavault',
  'sylvanlibrary',
  'necropotence',
  'cultivate',
  'kodamasreach',
  'farseek',
  'natureslore',
  'beastwithin',
  'chaoswarp',
  'generousgift',
  'anguishedunmaking',
  'toxicdeluge',
  'blasphemousact',
  'vandalblast',
  'farewell'
]);

const BASIC_LAND_NAMES = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes'
]);

// ---------- ANALIZAR COMANDANTE ----------
export function analyzeCommander(commander) {
  const text = (
    commander.oracle_text || ''
  ).toLowerCase();

  const type = (
    commander.type_line || ''
  ).toLowerCase();

  const colors =
    commander.color_identity || [];

  const profile = {
    tribes: new Set(),
    mechanics: new Set(),
    colors,

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

  const extractTribe = raw => {
    const clean = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z'-]/g, '');

    return CREATURE_TYPES.has(clean)
      ? clean
      : null;
  };

  const explicitTribes = new Set();

  const tribePatterns = [
    /(?:another|other|each|every|a|an)\s+([a-z'-]+)s?\s+(?:you control|you have|you cast|enters|dies|attacks|blocks|deals|triggers|is|has)/ig,
    /\b([a-z'-]+)s?\s+you control\b/ig,
    /\b(?:of|for|with) an?\s+([a-z'-]+)\s+you control\b/ig,
    /\bwhenever an?\s+([a-z'-]+)s?\b/ig
  ];

  for (const pattern of tribePatterns) {
    let match;

    while (
      (match = pattern.exec(text)) !== null
    ) {
      const tribe = extractTribe(
        match[1] || ''
      );

      if (tribe) {
        explicitTribes.add(tribe);
      }
    }
  }

  if (explicitTribes.size > 0) {
    for (const tribe of explicitTribes) {
      profile.tribes.add(tribe);
    }
  } else {
    const subtypeText =
      type.split('—')[1] || '';

    for (
      const part of subtypeText.split(/[, ]+/)
    ) {
      const tribe = extractTribe(part);

      if (tribe) {
        profile.tribes.add(tribe);
      }
    }
  }

  for (
    const { pattern, group }
    of MECHANIC_GROUPS
  ) {
    if (pattern.test(text)) {
      profile.mechanics.add(group);
    }
  }

  profile.careAboutCreatureType =
    profile.tribes.size > 0;

  profile.careAboutSpells =
    profile.mechanics.has('spells');

  profile.careAboutGraveyard =
    profile.mechanics.has('graveyard');

  profile.careAboutTokens =
    profile.mechanics.has('tokens');

  profile.careAboutCounters =
    profile.mechanics.has('counters');

  profile.careAboutArtifacts =
    profile.mechanics.has('artifacts') ||
    profile.mechanics.has('treasure');

  profile.careAboutEnchantments =
    profile.mechanics.has('enchantments');

  profile.careAboutLandfall =
    profile.mechanics.has('landfall');

  profile.careAboutLifegain =
    profile.mechanics.has('lifegain');

  profile.careAboutSacrifice =
    profile.mechanics.has('sacrifice');

  profile.careAboutETB =
    profile.mechanics.has('etb') ||
    profile.mechanics.has('blink');

  profile.careAboutEquipment =
    profile.mechanics.has('equipment') ||
    profile.mechanics.has('auras');

  profile.careAboutPing =
    profile.mechanics.has('ping');

  return profile;
}

// ---------- RELEVANCIA DE TIERRA ----------
function computeLandRelevance(
  card,
  profile
) {
  const text = (
    card.oracle_text || ''
  ).toLowerCase();

  const name = (
    card.name || ''
  )
    .toLowerCase()
    .trim();

  if (BASIC_LAND_NAMES.has(name)) {
    return 0.55;
  }

  if (
    /search your library for a (basic )?land/i
      .test(text)
  ) {
    return 0.6;
  }

  if (
    /command tower|exotic orchard|reflecting pool|city of brass|mana confluence/i
      .test(name)
  ) {
    return 0.65;
  }

  const colorWordMap = {
    W: 'white',
    U: 'blue',
    B: 'black',
    R: 'red',
    G: 'green'
  };

  let colorMatches = 0;

  for (const color of profile.colors) {
    const word = colorWordMap[color];

    if (
      word &&
      text.includes(word)
    ) {
      colorMatches++;
    }
  }

  if (colorMatches >= 2) {
    return 0.55;
  }

  if (colorMatches === 1) {
    return 0.4;
  }

  if (
    profile.colors &&
    profile.colors.length > 0
  ) {
    if (/\{c\}|colorless/i.test(text)) {
      return 0.02;
    }

    if (colorMatches === 0) {
      return 0.08;
    }
  }

  if (/\{c\}|colorless/i.test(text)) {
    return 0.1;
  }

  return 0.05;
}

// ---------- TEMAS ----------
const themePatterns = {
  voltron: {
    core: /\b(equip|enchant creature|aura|attached|equipped creature gets|enchanted creature)/i,
    support: /\b(double strike|hexproof|indestructible|protection from)/i
  },

  lifegain: {
    core: /\b(gain(s)? life|lifelink|whenever you gain life|life total)/i,
    support: /\b(angel|cleric|life.*greater)/i
  },

  tokens: {
    core: /\b(create(s)?.*token|populate|token(s)? (you control|creature))/i,
    support: /\b(doubling season|parallel lives|anointed procession|convoke)/i
  },

  aristocrats: {
    core: /\b(sacrifice(s)?|when(ever)?.*dies)/i,
    support: /\b(drain|fodder|persist|undying|grave pact)/i
  },

  burn: {
    core: /\b(deal(s)?.*damage to (target|each|any))/i,
    support: /\b(guttersnipe|firebrand|goblin)/i
  },

  storm: {
    core: /\b(instant(s)? (or|and) sorceries?|copy target spell|storm|magecraft)/i,
    support: /\b(cost.*less|prowess|spellslinger)/i
  },

  artifacts: {
    core: /\b(artifact(s)?|treasure|clue|historic|metalcraft|affinity)/i,
    support: /\b(improvise|modular|equipment|vehicle)/i
  },

  graveyard: {
    core: /\b(graveyard|mill|reanimate|dredge|escape|flashback|unearth)/i,
    support: /\b(delve|threshold|delirium|entomb)/i
  },

  aggro: {
    core: /\b(haste|attack(s|ing)|combat|\+\d\/|battalion|raid)/i,
    support: /\b(menace|trample|first strike|double strike)/i
  },

  control: {
    core: /\b(counter target|destroy all|exile all|board wipe)/i,
    support: /\b(draw.*card|scry|flash)/i
  },

  ramp: {
    core: /\b(add \{|search.*land|mana dork|mana rock)/i,
    support: /\b(cultivate|kodama|exploration)/i
  },

  counters: {
    core: /\b(\+1\/\+1 counter|proliferate|doubling counters)/i,
    support: /\b(modular|adapt|evolve|support)/i
  },

  blink: {
    core: /\b(exile.*return|flicker|blink|when.*enters)/i,
    support: /\b(enter(s)?.*battlefield|etb)/i
  },

  tribal: {
    core: /\b(creature type|choose a creature type|tribal)/i,
    support: /\b(changeling|lord|anthem)/i
  }
};

// ---------- RELEVANCIA PARA EL PERFIL ----------
export function computeProfileRelevance(
  card,
  profile,
  theme
) {
  const text = (
    card.oracle_text || ''
  ).toLowerCase();

  const type = (
    card.type_line || ''
  ).toLowerCase();

  const name = normalizeCardName(
    card.name
  );

  if (type.includes('land')) {
    return computeLandRelevance(
      card,
      profile
    );
  }

  let score = 0;
  let hits = 0;

  if (UNIVERSAL_STAPLES.has(name)) {
    score += 0.25;
    hits++;
  }

  const isRamp =
    /add \{[WUBRGC]|search.*land|\{t\}.*add/i
      .test(text) &&
    !type.includes('land');

  const isDraw =
    /draw.*card|look at.*top.*hand/i
      .test(text);

  if (isRamp || isDraw) {
    score += 0.15;
    hits++;
  }

  if (profile.careAboutCreatureType) {
    for (const tribe of profile.tribes) {
      if (
        text.includes(tribe) ||
        type.includes(tribe)
      ) {
        score += 0.65;
        hits++;
      }
    }
  }

  for (
    const { pattern, group }
    of MECHANIC_GROUPS
  ) {
    if (
      profile.mechanics.has(group) &&
      pattern.test(text)
    ) {
      score += 0.3;
      hits++;
    }
  }

  if (
    profile.careAboutCounters &&
    /\+1\/\+1 counter|proliferate/i
      .test(text)
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutTokens &&
    /create.*token|token.*you control/i
      .test(text)
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutGraveyard &&
    /graveyard|reanimate|flashback|unearth/i
      .test(text)
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutSpells &&
    /instant|sorcery|whenever you cast|magecraft/i
      .test(text)
  ) {
    score += 0.3;
    hits++;
  }

  if (
    profile.careAboutLifegain &&
    /gain.*life|lifelink|whenever.*gain life/i
      .test(text)
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutSacrifice &&
    /sacrifice|when.*dies/i
      .test(text)
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutETB &&
    /when.*enters|flicker|blink/i
      .test(text)
  ) {
    score += 0.3;
    hits++;
  }

  if (
    profile.careAboutArtifacts &&
    /\bartifact\b|treasure/i
      .test(text)
  ) {
    score += 0.3;
    hits++;
  }

  if (
    profile.careAboutEnchantments &&
    /\benchantment\b|constellation/i
      .test(text)
  ) {
    score += 0.3;
    hits++;
  }

  if (
    profile.careAboutLandfall &&
    /landfall|land.*enters.*battlefield/i
      .test(text)
  ) {
    score += 0.4;
    hits++;
  }

  if (
    profile.careAboutEquipment &&
    /equip|equipment|enchant creature/i
      .test(text)
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutPing &&
    /whenever.*deals damage|deals.*damage.*each/i
      .test(text)
  ) {
    score += 0.3;
    hits++;
  }

  if (
    profile.mechanics.has('ally') &&
    (
      type.includes('ally') ||
      /\bally\b/i.test(text)
    )
  ) {
    score += 0.45;
    hits++;
  }

  if (
    theme &&
    theme !== 'none' &&
    themePatterns[theme]
  ) {
    const config =
      themePatterns[theme];

    if (
      config.core.test(text) ||
      config.core.test(type)
    ) {
      score += 0.4;
      hits++;
    } else if (
      config.support?.test(text)
    ) {
      score += 0.2;
      hits++;
    }
  }

  if (hits === 0) {
    return -0.25;
  }

  return Math.min(score, 1);
}

// ---------- ETIQUETAS FUNCIONALES ----------
export function getCardTags(card) {
  const text = (
    card.oracle_text || ''
  ).toLowerCase();

  const type = (
    card.type_line || ''
  ).toLowerCase();

  const tags = [];

  if (type.includes('land')) {
    tags.push('land');
    return tags;
  }

  const isRamp =
    (
      /add \{[WUBRGC]\}/i.test(text) ||
      /search your library for (?:a|up to \w+) .*land/i
        .test(text) ||
      /put .*land card.*onto the battlefield/i
        .test(text)
    ) &&
    !type.includes('land');

  if (isRamp) {
    tags.push('ramp');
  }

  if (
    /draw (?:a|one|two|three|\d+) cards?/i
      .test(text) ||
    /draw cards equal/i.test(text) ||
    /whenever.*draw.*card/i.test(text)
  ) {
    tags.push('draw');
  }

  if (
    /destroy target|exile target|return target .* to (?:its|their) owner's hand|counter target spell/i
      .test(text)
  ) {
    tags.push('removal');
  }

  if (
    /destroy all|exile all|all creatures get -\d+\/-\d+|each creature gets -\d+\/-\d+/i
      .test(text)
  ) {
    tags.push('wipe');
  }

  if (
    /search your library for (?:a|an|any) card/i
      .test(text) ||
    /search your library for a .* card, reveal/i
      .test(text)
  ) {
    tags.push('tutor');
  }

  if (
    /hexproof|indestructible|protection from|phase out|counter target spell that targets|regenerate/i
      .test(text)
  ) {
    tags.push('protection');
  }

  if (
    /return target .* card from your graveyard/i
      .test(text) ||
    /return .* from your graveyard to the battlefield/i
      .test(text) ||
    /you may cast .* from your graveyard/i
      .test(text)
  ) {
    tags.push('recursion');
  }

  return [...new Set(tags)];
}

// ---------- DATOS EDHREC ----------
export function buildCommanderSynergyMap(
  edhrecCards = []
) {
  const result = new Map();

  for (const item of edhrecCards) {
    const name =
      item.name ||
      item.card?.name ||
      item.sanitized ||
      '';

    if (!name) {
      continue;
    }

    const synergy =
      Number(item.synergy) ||
      Number(item.synergy_score) ||
      0;

    result.set(
      normalizeCardName(name),
      synergy
    );
  }

  return result;
}

export function buildCooccurrenceMap(
  edhrecCards = []
) {
  const result = new Map();

  let maximumDeckCount = 0;

  for (const item of edhrecCards) {
    const count =
      Number(item.num_decks) ||
      Number(item.inclusion) ||
      Number(item.count) ||
      0;

    maximumDeckCount = Math.max(
      maximumDeckCount,
      count
    );
  }

  for (const item of edhrecCards) {
    const name =
      item.name ||
      item.card?.name ||
      item.sanitized ||
      '';

    if (!name) {
      continue;
    }

    const count =
      Number(item.num_decks) ||
      Number(item.inclusion) ||
      Number(item.count) ||
      0;

    const normalized =
      maximumDeckCount > 0
        ? count / maximumDeckCount
        : 0;

    result.set(
      normalizeCardName(name),
      normalized
    );
  }

  return result;
}

// ---------- SINERGIA DEL MAZO ----------
function getMechanicSet(card) {
  const text = (
    card.oracle_text || ''
  ).toLowerCase();

  const mechanics = new Set();

  for (
    const { pattern, group }
    of MECHANIC_GROUPS
  ) {
    if (pattern.test(text)) {
      mechanics.add(group);
    }
  }

  return mechanics;
}

export function computeDeckSynergyMap(
  candidates,
  selectedCards
) {
  const result = new Map();

  const selectedMechanics = new Set();
  const selectedTribes = new Set();

  for (const selected of selectedCards) {
    const text = (
      selected.oracle_text || ''
    ).toLowerCase();

    const type = (
      selected.type_line || ''
    ).toLowerCase();

    for (
      const mechanic
      of getMechanicSet(selected)
    ) {
      selectedMechanics.add(mechanic);
    }

    for (const tribe of CREATURE_TYPES) {
      if (
        type.includes(tribe) ||
        text.includes(tribe)
      ) {
        selectedTribes.add(tribe);
      }
    }
  }

  for (const card of candidates) {
    const text = (
      card.oracle_text || ''
    ).toLowerCase();

    const type = (
      card.type_line || ''
    ).toLowerCase();

    let synergy = 0;

    for (
      const { pattern, group }
      of MECHANIC_GROUPS
    ) {
      if (
        selectedMechanics.has(group) &&
        pattern.test(text)
      ) {
        synergy += 0.25;
      }
    }

    for (const tribe of selectedTribes) {
      if (
        type.includes(tribe) ||
        text.includes(tribe)
      ) {
        synergy += 0.2;
      }
    }

    result.set(
      normalizeCardName(card.name),
      Math.min(synergy, 1)
    );
  }

  return result;
}

// ---------- COMBOS Y PAQUETES ----------
const COMBO_PACKAGES = [
  [
    'exquisiteblood',
    'sanguinebond'
  ],
  [
    'mikaeustheunhallowed',
    'walkingballista'
  ],
  [
    'thassasoracle',
    'demonicconsultation'
  ],
  [
    'kikijikimirrorbreaker',
    'zealousconscripts'
  ],
  [
    'dramaticreversal',
    'isochronscepter'
  ]
];

function evaluateComboValue(
  card,
  availableNorms
) {
  const name = normalizeCardName(
    card.name
  );

  let value = 0;

  for (const combo of COMBO_PACKAGES) {
    if (!combo.includes(name)) {
      continue;
    }

    const otherPieces =
      combo.filter(piece => piece !== name);

    const complete =
      otherPieces.every(piece =>
        availableNorms.has(piece)
      );

    if (complete) {
      value += 0.65;
    } else {
      value -= 0.08;
    }
  }

  return value;
}

function evaluateSynergyPackage(
  card,
  availableNorms
) {
  const text = (
    card.oracle_text || ''
  ).toLowerCase();

  let value = 0;

  const packages = [
    {
      enabler:
        /create.*token|whenever.*creature.*enters/i,
      payoff:
        /whenever.*creature.*dies|sacrifice another creature/i
    },
    {
      enabler:
        /mill|put.*graveyard/i,
      payoff:
        /return.*graveyard|cast.*graveyard/i
    },
    {
      enabler:
        /whenever.*cast.*instant|whenever.*cast.*sorcery/i,
      payoff:
        /copy.*spell|cost.*less/i
    }
  ];

  for (const packageDefinition of packages) {
    const isEnabler =
      packageDefinition.enabler.test(text);

    const isPayoff =
      packageDefinition.payoff.test(text);

    if (!isEnabler && !isPayoff) {
      continue;
    }

    let supportingCards = 0;

    for (const name of availableNorms) {
      if (name === normalizeCardName(card.name)) {
        continue;
      }

      supportingCards++;
    }

    if (supportingCards > 0) {
      value += 0.08;
    }
  }

  return Math.min(value, 0.3);
}

// ---------- PUNTUACIÓN ----------
export function computeCardScore({
  card,
  collectionCounts = new Map(),
  commanderProfile,
  commanderSynergyMap = new Map(),
  deckSynergyMap = new Map(),
  cooccurrenceMap = new Map(),
  theme = 'none',
  availableNorms = new Set()
}) {
  const normalizedName =
    normalizeCardName(card.name);

  const owned =
    collectionCounts.has(normalizedName);

  const profileRelevance =
    computeProfileRelevance(
      card,
      commanderProfile,
      theme
    );

  const commanderSynergy =
    commanderSynergyMap.get(
      normalizedName
    ) || 0;

  const deckSynergy =
    deckSynergyMap.get(
      normalizedName
    ) || 0;

  const popularity =
    cooccurrenceMap.get(
      normalizedName
    ) || 0;

  const comboValue =
    evaluateComboValue(
      card,
      availableNorms
    );

  const packageValue =
    evaluateSynergyPackage(
      card,
      availableNorms
    );

  const edhrecRank =
    Number(card.edhrec_rank);

  const rankScore =
    Number.isFinite(edhrecRank)
      ? Math.max(
          0,
          1 - Math.log10(edhrecRank + 1) / 5
        )
      : 0;

  const price =
    Number.parseFloat(
      card.prices?.usd || '0'
    ) || 0;

  const pricePenalty =
    owned
      ? 0
      : Math.min(price / 30, 0.4);

  let score = 0;

  score += owned ? 100 : 0;
  score += profileRelevance * 55;
  score += commanderSynergy * 45;
  score += deckSynergy * 30;
  score += popularity * 14;
  score += rankScore * 12;
  score += comboValue * 40;
  score += packageValue * 20;
  score -= pricePenalty * 10;

  return score;
}

// ---------- ORDENACIÓN ----------
export function sortByScore({
  cards,
  collectionCounts,
  commanderProfile,
  commanderSynergyMap,
  deckSynergyMap,
  cooccurrenceMap,
  theme,
  availableNorms
}) {
  return [...cards].sort(
    (cardA, cardB) => {
      const scoreB = computeCardScore({
        card: cardB,
        collectionCounts,
        commanderProfile,
        commanderSynergyMap,
        deckSynergyMap,
        cooccurrenceMap,
        theme,
        availableNorms
      });

      const scoreA = computeCardScore({
        card: cardA,
        collectionCounts,
        commanderProfile,
        commanderSynergyMap,
        deckSynergyMap,
        cooccurrenceMap,
        theme,
        availableNorms
      });

      return scoreB - scoreA;
    }
  );
}

export function sortByScoreIterative({
  cards,
  collectionCounts,
  commanderProfile,
  commanderSynergyMap,
  cooccurrenceMap,
  theme,
  commander,
  iterations = 3,
  topN = 120
}) {
  const availableNorms = new Set(
    cards.map(card =>
      normalizeCardName(card.name)
    )
  );

  let ordered = sortByScore({
    cards,
    collectionCounts,
    commanderProfile,
    commanderSynergyMap,
    deckSynergyMap: new Map(),
    cooccurrenceMap,
    theme,
    availableNorms
  });

  for (
    let iteration = 0;
    iteration < iterations;
    iteration++
  ) {
    const selected = [
      commander,
      ...ordered.slice(0, topN)
    ].filter(Boolean);

    const deckSynergyMap =
      computeDeckSynergyMap(
        cards,
        selected
      );

    ordered = sortByScore({
      cards,
      collectionCounts,
      commanderProfile,
      commanderSynergyMap,
      deckSynergyMap,
      cooccurrenceMap,
      theme,
      availableNorms
    });
  }

  return ordered;
}

// ---------- CONSTRUCTOR CONSISTENTE ----------
const FUNCTIONAL_ROLES = [
  'ramp',
  'draw',
  'removal',
  'wipe',
  'tutor',
  'protection',
  'recursion'
];

function chooseBestRole(
  card,
  roleCounts,
  roleTargets
) {
  const cardRoles = getCardTags(card)
    .filter(role =>
      FUNCTIONAL_ROLES.includes(role)
    );

  let bestRole = null;
  let highestNeed = 0;

  for (const role of cardRoles) {
    const target = Math.max(
      0,
      Number(roleTargets[role]) || 0
    );

    if (target === 0) {
      continue;
    }

    const current =
      roleCounts[role] || 0;

    const need =
      Math.max(0, target - current) /
      target;

    if (need > highestNeed) {
      highestNeed = need;
      bestRole = role;
    }
  }

  return {
    role: bestRole,
    need: highestNeed
  };
}

function computeCurvePenalty(
  card,
  selectedCards
) {
  const cmc =
    Number(card.cmc) || 0;

  if (cmc <= 3) {
    return 0;
  }

  const expensiveCards =
    selectedCards.filter(
      selected =>
        (Number(selected.cmc) || 0) >= 5
    ).length;

  const allowedExpensiveCards =
    Math.max(
      5,
      Math.floor(
        (selectedCards.length + 1) *
        0.18
      )
    );

  if (
    expensiveCards >=
    allowedExpensiveCards
  ) {
    return (cmc - 3) * 4;
  }

  return (cmc - 3) * 0.8;
}

function computeRedundancyPenalty(
  card,
  selectedCards
) {
  const cardMechanics =
    getMechanicSet(card);

  if (
    cardMechanics.size === 0 ||
    selectedCards.length < 8
  ) {
    return 0;
  }

  const mechanicCounts = new Map();

  for (const selectedCard of selectedCards) {
    for (
      const mechanic
      of getMechanicSet(selectedCard)
    ) {
      mechanicCounts.set(
        mechanic,
        (
          mechanicCounts.get(mechanic) ||
          0
        ) + 1
      );
    }
  }

  let penalty = 0;

  for (const mechanic of cardMechanics) {
    const ratio =
      (
        mechanicCounts.get(mechanic) ||
        0
      ) /
      selectedCards.length;

    if (ratio > 0.45) {
      penalty +=
        (ratio - 0.45) * 18;
    }
  }

  return penalty;
}

function hasMissingFunctionalRoles(
  roleCounts,
  roleTargets
) {
  return FUNCTIONAL_ROLES.some(
    role => {
      const current =
        roleCounts[role] || 0;

      const target =
        Number(roleTargets[role]) || 0;

      return current < target;
    }
  );
}

function getCardPrice(
  card,
  collectionCounts
) {
  const normalizedName =
    normalizeCardName(card.name);

  if (
    collectionCounts.has(
      normalizedName
    )
  ) {
    return 0;
  }

  return (
    Number.parseFloat(
      card.prices?.usd || '0'
    ) || 0
  );
}

function scoreMarginalCandidate({
  card,
  selectedCards,
  selectedContext,
  selectedNames,
  roleCounts,
  roleTargets,
  collectionCounts,
  commanderProfile,
  commanderSynergyMap,
  deckSynergyMap,
  cooccurrenceMap,
  theme
}) {
  const normalizedName =
    normalizeCardName(card.name);

  const availableNorms =
    new Set(selectedNames);

  availableNorms.add(normalizedName);

  const { role, need } =
    chooseBestRole(
      card,
      roleCounts,
      roleTargets
    );

  let score = computeCardScore({
    card,
    collectionCounts,
    commanderProfile,
    commanderSynergyMap,
    deckSynergyMap,
    cooccurrenceMap,
    theme,
    availableNorms
  });

  score += need * 55;

  score -= computeCurvePenalty(
    card,
    selectedCards
  );

  score -= computeRedundancyPenalty(
    card,
    selectedCards
  );

  if (
    !role &&
    hasMissingFunctionalRoles(
      roleCounts,
      roleTargets
    )
  ) {
    score -= 18;
  }

  return {
    score,
    role,
    selectedContext
  };
}

export function buildConsistentNonLandDeck({
  cards,
  targetCount,
  roleTargets,
  collectionCounts,
  commanderProfile,
  commanderSynergyMap = new Map(),
  cooccurrenceMap = new Map(),
  theme = 'none',
  commander = null,
  maxBudget = 0,
  startingCost = 0,
  maxPriceLimit = Infinity,
  prefilterSize = 360
}) {
  const safeCollectionCounts =
    collectionCounts || new Map();

  const emptyDeckSynergy =
    new Map();

  const noAvailableComboPieces =
    new Set();

  const prefilteredCards = [
    ...cards
  ]
    .sort((cardA, cardB) => {
      const scoreB = computeCardScore({
        card: cardB,
        collectionCounts:
          safeCollectionCounts,
        commanderProfile,
        commanderSynergyMap,
        deckSynergyMap:
          emptyDeckSynergy,
        cooccurrenceMap,
        theme,
        availableNorms:
          noAvailableComboPieces
      });

      const scoreA = computeCardScore({
        card: cardA,
        collectionCounts:
          safeCollectionCounts,
        commanderProfile,
        commanderSynergyMap,
        deckSynergyMap:
          emptyDeckSynergy,
        cooccurrenceMap,
        theme,
        availableNorms:
          noAvailableComboPieces
      });

      return scoreB - scoreA;
    })
    .slice(
      0,
      Math.max(
        targetCount * 3,
        prefilterSize
      )
    );

  const selectedCards = [];

  const remainingCards = new Map(
    prefilteredCards.map(card => [
      normalizeCardName(card.name),
      card
    ])
  );

  const roleCounts =
    Object.fromEntries(
      FUNCTIONAL_ROLES.map(
        role => [role, 0]
      )
    );

  let currentCost = startingCost;

  while (
    selectedCards.length < targetCount &&
    remainingCards.size > 0
  ) {
    const selectedContext =
      commander
        ? [commander, ...selectedCards]
        : [...selectedCards];

    const remainingValues = [
      ...remainingCards.values()
    ];

    const deckSynergyMap =
      computeDeckSynergyMap(
        remainingValues,
        selectedContext
      );

    const selectedNames = new Set(
      selectedContext.map(card =>
        normalizeCardName(card.name)
      )
    );

    let bestCandidate = null;

    for (
      const card
      of remainingValues
    ) {
      const price = getCardPrice(
        card,
        safeCollectionCounts
      );

      if (price > maxPriceLimit) {
        continue;
      }

      if (
        maxBudget > 0 &&
        currentCost + price > maxBudget
      ) {
        continue;
      }

      const marginal =
        scoreMarginalCandidate({
          card,
          selectedCards,
          selectedContext,
          selectedNames,
          roleCounts,
          roleTargets,
          collectionCounts:
            safeCollectionCounts,
          commanderProfile,
          commanderSynergyMap,
          deckSynergyMap,
          cooccurrenceMap,
          theme
        });

      if (
        bestCandidate === null ||
        marginal.score >
          bestCandidate.score
      ) {
        bestCandidate = {
          card,
          role: marginal.role,
          score: marginal.score,
          price
        };
      }
    }

    if (!bestCandidate) {
      break;
    }

    const selectedCard = {
      ...bestCandidate.card,
      _assignedRole:
        bestCandidate.role ||
        'flex synergy',
      _selectionScore:
        bestCandidate.score
    };

    selectedCards.push(
      selectedCard
    );

    if (bestCandidate.role) {
      roleCounts[
        bestCandidate.role
      ]++;
    }

    currentCost +=
      bestCandidate.price;

    remainingCards.delete(
      normalizeCardName(
        bestCandidate.card.name
      )
    );
  }

  return {
    cards: selectedCards,
    cost: currentCost,
    roleCounts
  };
}