// scoring.js - Sistema de puntuación para Commander

// ---------- UTIL ----------
export function normalizeCardName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ---------- TIPOS DE CRIATURA ----------
const CREATURE_TYPES = new Set([
  "angel",
  "demon",
  "dragon",
  "zombie",
  "vampire",
  "elf",
  "goblin",
  "merfolk",
  "ally",
  "wizard",
  "warrior",
  "knight",
  "cleric",
  "rogue",
  "shaman",
  "druid",
  "monk",
  "beast",
  "bird",
  "cat",
  "dinosaur",
  "elemental",
  "faerie",
  "giant",
  "golem",
  "human",
  "hydra",
  "insect",
  "minotaur",
  "phoenix",
  "pirate",
  "plant",
  "rat",
  "saproling",
  "serpent",
  "skeleton",
  "sliver",
  "soldier",
  "sphinx",
  "spirit",
  "treefolk",
  "wolf",
  "wurm",
  "construct",
  "horror",
  "illusion",
  "kithkin",
  "leviathan",
  "ooze",
  "pegasus",
  "praetor",
  "shade",
  "shapeshifter",
  "spawn",
  "specter",
  "thrull",
  "troll",
  "unicorn",
  "archer",
  "assassin",
  "berserker",
  "centaur",
  "djinn",
  "dryad",
  "fungus",
  "gorgon",
  "homunculus",
  "imp",
  "kavu",
  "lizard",
  "ninja",
  "ogre",
  "orc",
  "scorpion",
  "spider",
  "squid",
  "turtle",
  "naga",
  "viashino",
  "vedalken",
  "gnome",
  "mutant",
  "avatar",
]);

// ---------- MECÁNICAS ----------
const MECHANIC_GROUPS = [
  {
    pattern: /\bally\b/i,
    group: "ally",
  },
  {
    pattern: /\+1\/\+1 counter/i,
    group: "counters",
  },
  {
    pattern: /proliferate/i,
    group: "counters",
  },
  {
    pattern: /create.*token/i,
    group: "tokens",
  },
  {
    pattern: /populate/i,
    group: "tokens",
  },
  {
    pattern: /\bsacrifice\b/i,
    group: "sacrifice",
  },
  {
    pattern: /when.*dies/i,
    group: "sacrifice",
  },
  {
    pattern: /graveyard/i,
    group: "graveyard",
  },
  {
    pattern: /flashback|unearth|escape/i,
    group: "graveyard",
  },
  {
    pattern: /whenever you cast/i,
    group: "spells",
  },
  {
    pattern: /magecraft/i,
    group: "spells",
  },
  {
    pattern: /copy.*spell/i,
    group: "spells",
  },
  {
    pattern: /when.*enters/i,
    group: "etb",
  },
  {
    pattern: /flicker|blink/i,
    group: "blink",
  },
  {
    pattern: /\bequip\b|equipment/i,
    group: "equipment",
  },
  {
    pattern: /enchant creature|aura/i,
    group: "auras",
  },
  {
    pattern: /gain.*life|lifelink/i,
    group: "lifegain",
  },
  {
    pattern: /whenever.*gain.*life/i,
    group: "lifegain",
  },
  {
    pattern: /draw.*card/i,
    group: "draw",
  },
  {
    pattern: /wheel.*each player draws/i,
    group: "wheels",
  },
  {
    pattern: /add \{[WUBRGC]/i,
    group: "ramp",
  },
  {
    pattern: /search.*land/i,
    group: "ramp",
  },
  {
    pattern: /\bartifact\b/i,
    group: "artifacts",
  },
  {
    pattern: /treasure/i,
    group: "treasure",
  },
  {
    pattern: /\benchantment\b/i,
    group: "enchantments",
  },
  {
    pattern: /constellation/i,
    group: "enchantments",
  },
  {
    pattern: /whenever.*attacks/i,
    group: "attack-triggers",
  },
  {
    pattern: /additional combat/i,
    group: "combat",
  },
  {
    pattern: /landfall/i,
    group: "landfall",
  },
  {
    pattern: /\bmill\b/i,
    group: "mill",
  },
  {
    pattern: /deals.*damage.*each/i,
    group: "ping",
  },
  {
    pattern: /whenever.*deals damage/i,
    group: "ping",
  },
];

// ---------- STAPLES UNIVERSALES ----------
const UNIVERSAL_STAPLES = new Set([
  "solring",
  "arcanesignet",
  "commandtower",
  "lightninggreaves",
  "swiftfootboots",
  "swordstoplowshares",
  "pathtoexi",
  "counterspell",
  "cyclonicrift",
  "demonictutor",
  "vampirictutor",
  "rhysticstudy",
  "smotheringtithe",
  "docksideextortionist",
  "fierceguardianship",
  "deflectingswat",
  "deadlyrollick",
  "jeskaswill",
  "espersentinel",
  "manacrypt",
  "manavault",
  "sylvanlibrary",
  "necropotence",
  "cultivate",
  "kodamasreach",
  "farseek",
  "natureslore",
  "beastwith",
  "chaoswarp",
  "generousgift",
  "anguishedunmaking",
  "toxicdeluge",
  "blasphemousact",
  "vandalblast",
  "farewell",
]);

const BASIC_LAND_NAMES = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
]);

// ---------- ANALIZAR COMANDANTE ----------
export function analyzeCommander(commander) {
  const text = (
    commander.oracle_text || ""
  ).toLowerCase();

  const type = (
    commander.type_line || ""
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
    careAboutPing: false,
  };

  const extractTribe = raw => {
    const clean = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z'-]/g, "");

    return CREATURE_TYPES.has(clean)
      ? clean
      : null;
  };

  const explicitTribes = new Set();

  const tribePatterns = [
    /(?:another|other|each|every|a|an)\s+([a-z'-]+)s?\s+(?:you control|you have|you cast|enters|dies|attacks|blocks|deals|triggers|is|has)/gi,
    /\b([a-z'-]+)s?\s+you control\b/gi,
    /\b(?:of|for|with) an?\s+([a-z'-]+)\s+you control\b/gi,
    /\bwhenever an?\s+([a-z'-]+)s?\b/gi,
  ];

  for (const pattern of tribePatterns) {
    let match;

    while (
      (match = pattern.exec(text)) !==
      null
    ) {
      const tribe = extractTribe(
        match[1] || ""
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
      type.split("—")[1] || "";

    for (
      const part of subtypeText.split(
        /[, ]+/
      )
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
    profile.mechanics.has("spells");

  profile.careAboutGraveyard =
    profile.mechanics.has("graveyard");

  profile.careAboutTokens =
    profile.mechanics.has("tokens");

  profile.careAboutCounters =
    profile.mechanics.has("counters");

  profile.careAboutArtifacts =
    profile.mechanics.has(
      "artifacts"
    ) ||
    profile.mechanics.has(
      "treasure"
    );

  profile.careAboutEnchantments =
    profile.mechanics.has(
      "enchantments"
    );

  profile.careAboutLandfall =
    profile.mechanics.has("landfall");

  profile.careAboutLifegain =
    profile.mechanics.has("lifegain");

  profile.careAboutSacrifice =
    profile.mechanics.has(
      "sacrifice"
    );

  profile.careAboutETB =
    profile.mechanics.has("etb") ||
    profile.mechanics.has("blink");

  profile.careAboutEquipment =
    profile.mechanics.has(
      "equipment"
    ) ||
    profile.mechanics.has("auras");

  profile.careAboutPing =
    profile.mechanics.has("ping");

  return profile;
}

// ---------- RELEVANCIA DE TIERRA ----------
function computeLandRelevance(
  card,
  profile
) {
  const text = (
    card.oracle_text || ""
  ).toLowerCase();

  const name = (
    card.name || ""
  )
    .toLowerCase()
    .trim();

  if (BASIC_LAND_NAMES.has(name)) {
    return 0.55;
  }

  if (
    /search your library for a (basic )?land/i.test(
      text
    )
  ) {
    return 0.6;
  }

  if (
    /command tower|exotic orchard|reflecting pool|city of brass|mana confluence/i.test(
      name
    )
  ) {
    return 0.65;
  }

  const colorWordMap = {
    W: "white",
    U: "blue",
    B: "black",
    R: "red",
    G: "green",
  };

  let colorMatches = 0;

  for (const color of profile.colors) {
    const word =
      colorWordMap[color];

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
    if (
      /\{c\}|colorless/i.test(text)
    ) {
      return 0.02;
    }

    if (colorMatches === 0) {
      return 0.08;
    }
  }

  if (
    /\{c\}|colorless/i.test(text)
  ) {
    return 0.1;
  }

  return 0.05;
}

// ---------- TEMAS ----------
const themePatterns = {
  voltron: {
    core:
      /\b(equip|enchant creature|aura|attached|equipped creature gets|enchanted creature)/i,

    support:
      /\b(double strike|hexproof|indestructible|protection from)/i,
  },

  lifegain: {
    core:
      /\b(gain(s)? life|lifelink|whenever you gain life|life total)/i,

    support:
      /\b(angel|cleric|life.*greater)/i,
  },

  tokens: {
    core:
      /\b(create(s)?.*token|populate|token(s)? (you control|creature))/i,

    support:
      /\b(doubling season|parallel lives|anointed procession|convoke)/i,
  },

  aristocrats: {
    core:
      /\b(sacrifice(s)?|when(ever)?.*dies)/i,

    support:
      /\b(drain|fodder|persist|undying|grave pact)/i,
  },

  burn: {
    core:
      /\b(deal(s)?.*damage to (target|each|any))/i,

    support:
      /\b(guttersnipe|firebrand|goblin)/i,
  },

  storm: {
    core:
      /\b(instant(s)? (or|and) sorceries?|copy target spell|storm|magecraft)/i,

    support:
      /\b(cost.*less|prowess|spellslinger)/i,
  },

  artifacts: {
    core:
      /\b(artifact(s)?|treasure|clue|historic|metalcraft|affinity)/i,

    support:
      /\b(improvise|modular|equipment|vehicle)/i,
  },

  graveyard: {
    core:
      /\b(graveyard|mill|reanimate|dredge|escape|flashback|unearth)/i,

    support:
      /\b(delve|threshold|delirium|entomb)/i,
  },

  aggro: {
    core:
      /\b(haste|attack(s|ing)|combat|\+\d\/|battalion|raid)/i,

    support:
      /\b(menace|trample|first strike|double strike)/i,
  },

  control: {
    core:
      /\b(counter target|destroy all|exile all|board wipe)/i,

    support:
      /\b(draw.*card|scry|flash)/i,
  },

  ramp: {
    core:
      /\b(add \{|search.*land|mana dork|mana rock)/i,

    support:
      /\b(cultivate|kodama|exploration)/i,
  },

  counters: {
    core:
      /\b(\+1\/\+1 counter|proliferate|-1\/-1 counter)/i,

    support:
      /\b(modular|graft|evolve|mentor)/i,
  },

  enchantress: {
    core:
      /\b(enchantment|aura|constellation|whenever.*enchantment)/i,

    support:
      /\b(enchantress|shrine|saga)/i,
  },

  tribal: {
    core:
      /\b(creatures? you control (get|have)|creature type|changeling)/i,

    support:
      /\b(lord|anthem|kindred|tribal)/i,
  },
};

// ---------- RELEVANCIA PARA EL PERFIL ----------
export function computeProfileRelevance(
  card,
  profile,
  theme
) {
  const text = (
    card.oracle_text || ""
  ).toLowerCase();

  const type = (
    card.type_line || ""
  ).toLowerCase();

  const name = normalizeCardName(
    card.name
  );

  if (type.includes("land")) {
    return computeLandRelevance(
      card,
      profile
    );
  }

  let score = 0;
  let hits = 0;

  if (
    UNIVERSAL_STAPLES.has(name)
  ) {
    score += 0.25;
    hits++;
  }

  const isRamp =
    /add \{[WUBRGC]|search.*land|\{t\}.*add/i.test(
      text
    ) &&
    !type.includes("land");

  const isDraw =
    /draw.*card|look at.*top.*hand/i.test(
      text
    );

  if (isRamp || isDraw) {
    score += 0.15;
    hits++;
  }

  if (
    profile.careAboutCreatureType
  ) {
    for (
      const tribe
      of profile.tribes
    ) {
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
    /\+1\/\+1 counter|proliferate/i.test(
      text
    )
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutTokens &&
    /create.*token|token.*you control/i.test(
      text
    )
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutGraveyard &&
    /graveyard|reanimate|flashback|unearth/i.test(
      text
    )
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutSpells &&
    /instant|sorcery|whenever you cast|magecraft/i.test(
      text
    )
  ) {
    score += 0.3;
    hits++;
  }

  if (
    profile.careAboutLifegain &&
    /gain.*life|lifelink|whenever.*gain life/i.test(
      text
    )
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutSacrifice &&
    /sacrifice|when.*dies/i.test(
      text
    )
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutETB &&
    /when.*enters|flicker|blink/i.test(
      text
    )
  ) {
    score += 0.3;
    hits++;
  }

  if (
    profile.careAboutArtifacts &&
    /\bartifact\b|treasure/i.test(
      text
    )
  ) {
    score += 0.3;
    hits++;
  }

  if (
    profile.careAboutEnchantments &&
    /\benchantment\b|constellation/i.test(
      text
    )
  ) {
    score += 0.3;
    hits++;
  }

  if (
    profile.careAboutLandfall &&
    /landfall|land.*enters.*battlefield/i.test(
      text
    )
  ) {
    score += 0.4;
    hits++;
  }

  if (
    profile.careAboutEquipment &&
    /equip|equipment|enchant creature/i.test(
      text
    )
  ) {
    score += 0.35;
    hits++;
  }

  if (
    profile.careAboutPing &&
    /whenever.*deals damage|deals.*damage.*each/i.test(
      text
    )
  ) {
    score += 0.3;
    hits++;
  }

  if (
    profile.mechanics.has("ally") &&
    (
      type.includes("ally") ||
      /\bally\b/i.test(text)
    )
  ) {
    score += 0.45;
    hits++;
  }

  if (
    theme &&
    theme !== "none" &&
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

// ---------- COMBOS ----------
const knownCombos = [
  {
    pieces: [
      "peregrine drake",
      "deadeye navigator",
    ],

    support: [
      "palinchron",
      "great whale",
    ],

    value: 30,
  },

  {
    pieces: [
      "dramatic reversal",
      "isochron scepter",
    ],

    support: [
      "sol ring",
      "mana vault",
      "arcane signet",
    ],

    value: 35,
  },

  {
    pieces: [
      "basalt monolith",
      "rings of brighthearth",
    ],

    support: [
      "power artifact",
    ],

    value: 28,
  },

  {
    pieces: [
      "dockside extortionist",
      "temur sabertooth",
    ],

    support: [
      "cloudstone curio",
    ],

    value: 32,
  },

  {
    pieces: [
      "worldgorger dragon",
      "animate dead",
    ],

    support: [
      "dance of the dead",
      "necromancy",
    ],

    value: 30,
  },

  {
    pieces: [
      "kiki-jiki, mirror breaker",
      "zealous conscripts",
    ],

    support: [
      "splinter twin",
      "pestermite",
      "deceiver exarch",
      "felidar guardian",
    ],

    value: 35,
  },

  {
    pieces: [
      "reveillark",
      "karmic guide",
    ],

    support: [
      "fiend hunter",
      "altar of dementia",
      "viscera seer",
    ],

    value: 28,
  },

  {
    pieces: [
      "nim deathmantle",
      "ashnod's altar",
    ],

    support: [
      "grave titan",
      "wurmcoil engine",
    ],

    value: 25,
  },

  {
    pieces: [
      "niv-mizzet, parun",
      "curiosity",
    ],

    support: [
      "niv-mizzet, the firemind",
      "ophidian eye",
      "tandem lookout",
    ],

    value: 30,
  },

  {
    pieces: [
      "exquisite blood",
      "sanguine bond",
    ],

    support: [
      "vito, thorn of the dusk rose",
    ],

    value: 28,
  },

  {
    pieces: [
      "mikaeus, the unhallowed",
      "triskelion",
    ],

    support: [
      "walking ballista",
      "murderous redcap",
    ],

    value: 32,
  },

  {
    pieces: [
      "heliod, sun-crowned",
      "walking ballista",
    ],

    support: [
      "spike feeder",
    ],

    value: 30,
  },

  {
    pieces: [
      "thassa's oracle",
      "demonic consultation",
    ],

    support: [
      "tainted pact",
      "laboratory maniac",
    ],

    value: 40,
  },

  {
    pieces: [
      "painter's servant",
      "grindstone",
    ],

    support: [],

    value: 28,
  },

  {
    pieces: [
      "time warp",
      "archaeomancer",
    ],

    support: [
      "ghostly flicker",
      "displace",
    ],

    value: 30,
  },

  {
    pieces: [
      "gravecrawler",
      "phyrexian altar",
    ],

    support: [
      "blood artist",
      "zulaport cutthroat",
    ],

    value: 30,
  },

  {
    pieces: [
      "devoted druid",
      "vizier of remedies",
    ],

    support: [],

    value: 28,
  },

  {
    pieces: [
      "spike feeder",
      "archangel of thune",
    ],

    support: [],

    value: 26,
  },
];

// ---------- PAQUETES ----------
const synergyPackages = [
  {
    core: [
      "conjurer's closet",
      "panharmonicon",
      "thassa, deep-dwelling",
    ],

    synergizes: [
      "mulldrifter",
      "cloudblazer",
      "ravenous chupacabra",
      "eternal witness",
    ],

    value: 0.2,
  },

  {
    core: [
      "doubling season",
      "parallel lives",
      "anointed procession",
    ],

    synergizes: [
      "avenger of zendikar",
      "tendershoot dryad",
    ],

    value: 0.22,
  },

  {
    core: [
      "viscera seer",
      "ashnod's altar",
      "phyrexian altar",
    ],

    synergizes: [
      "grave pact",
      "dictate of erebos",
      "blood artist",
      "zulaport cutthroat",
    ],

    value: 0.22,
  },

  {
    core: [
      "reanimate",
      "animate dead",
      "necromancy",
    ],

    synergizes: [
      "entomb",
      "buried alive",
      "faithless looting",
    ],

    value: 0.2,
  },

  {
    core: [
      "thousand-year storm",
      "storm-kiln artist",
    ],

    synergizes: [
      "aetherflux reservoir",
      "guttersnipe",
    ],

    value: 0.22,
  },

  {
    core: [
      "wheel of fortune",
      "windfall",
      "whispering madness",
    ],

    synergizes: [
      "notion thief",
      "narset, parter of veils",
      "smothering tithe",
    ],

    value: 0.2,
  },

  {
    core: [
      "enchantress's presence",
      "argothian enchantress",
    ],

    synergizes: [
      "sigil of the empty throne",
      "sphere of safety",
    ],

    value: 0.2,
  },

  {
    core: [
      "hardened scales",
      "doubling season",
      "branching evolution",
    ],

    synergizes: [
      "walking ballista",
      "hangarback walker",
      "kalonian hydra",
    ],

    value: 0.2,
  },

  {
    core: [
      "stoneforge mystic",
      "puresteel paladin",
      "sram, senior edificer",
    ],

    synergizes: [
      "sword of feast and famine",
      "sword of fire and ice",
      "batterskull",
    ],

    value: 0.2,
  },

  {
    core: [
      "smothering tithe",
      "dockside extortionist",
      "goldspan dragon",
    ],

    synergizes: [
      "revel in riches",
      "academy manufactor",
      "marionette master",
    ],

    value: 0.22,
  },
];

// ---------- AUXILIARES ----------
function evaluateManaEfficiency(card) {
  const cmc = card.cmc || 0;

  const text = (
    card.oracle_text || ""
  ).toLowerCase();

  let score = 0;

  if (cmc <= 2) {
    score += 10;

    if (
      /draw|destroy|exile/.test(
        text
      )
    ) {
      score += 6;
    }
  } else if (cmc <= 4) {
    score += 4;
  } else if (cmc >= 7) {
    score -= 5;

    if (
      /\ball\b|\beach\b|win the game/.test(
        text
      )
    ) {
      score += 8;
    }
  }

  if (
    /cost.*less|without paying/.test(
      text
    )
  ) {
    score += 8;
  }

  return score;
}

function evaluateCombatKeywords(card) {
  const text = (
    card.oracle_text || ""
  ).toLowerCase();

  const keywords = (
    card.keywords || []
  ).map(keyword =>
    keyword.toLowerCase()
  );

  const values = {
    flying: 8,
    hexproof: 15,
    indestructible: 18,
    haste: 10,
    flash: 12,
    deathtouch: 10,
    trample: 7,
    "double strike": 15,
    lifelink: 8,
    cascade: 20,
    ward: 10,
    persist: 10,
    undying: 12,
    menace: 6,
  };

  let score = 0;

  for (
    const [keyword, value]
    of Object.entries(values)
  ) {
    if (
      text.includes(keyword) ||
      keywords.includes(keyword)
    ) {
      score += value;
    }
  }

  return Math.min(score, 50);
}

function evaluateVersatility(card) {
  const text = (
    card.oracle_text || ""
  ).toLowerCase();

  let score = 0;

  if (
    /choose one|choose two|modal/.test(
      text
    )
  ) {
    score += 12;
  }

  if (
    card.card_faces?.length > 1
  ) {
    score += 8;
  }

  if (
    /target permanent|any target/.test(
      text
    )
  ) {
    score += 8;
  }

  return score;
}

function evaluatePenalties(card) {
  const text = (
    card.oracle_text || ""
  ).toLowerCase();

  let penalty = 0;

  if (
    /each (player|opponent) (draws|creates|gains)/.test(
      text
    )
  ) {
    penalty -= 12;
  }

  if (
    /as an additional cost.*sacrifice a creature/.test(
      text
    )
  ) {
    penalty -= 8;
  }

  if (
    /enters the battlefield tapped/.test(
      text
    )
  ) {
    penalty -= 5;
  }

  if (
    /only during combat/.test(
      text
    )
  ) {
    penalty -= 4;
  }

  return penalty;
}

function evaluateComboValue(
  card,
  availableNorms
) {
  const cardName =
    normalizeCardName(card.name);

  let total = 0;

  for (const combo of knownCombos) {
    const pieceNames =
      combo.pieces.map(
        normalizeCardName
      );

    const supportNames =
      combo.support.map(
        normalizeCardName
      );

    const isPiece =
      pieceNames.includes(cardName);

    const isSupport =
      !isPiece &&
      supportNames.includes(cardName);

    if (!isPiece && !isSupport) {
      continue;
    }

    const availablePieces =
      pieceNames.filter(
        piece =>
          piece === cardName ||
          availableNorms.has(piece)
      ).length;

    const ratio =
      availablePieces /
      pieceNames.length;

    if (isPiece) {
      total +=
        combo.value *
        (
          ratio >= 1
            ? 1.5
            : ratio >= 0.5
              ? ratio
              : 0.3
        );
    }

    if (isSupport) {
      total +=
        combo.value * 0.35;
    }
  }

  return Math.min(total, 80);
}

function evaluateSynergyPackage(
  card,
  availableNorms
) {
  const cardName =
    normalizeCardName(card.name);

  let total = 0;

  for (
    const synergyPackage
    of synergyPackages
  ) {
    const coreNames =
      synergyPackage.core.map(
        normalizeCardName
      );

    const synergyNames =
      synergyPackage.synergizes.map(
        normalizeCardName
      );

    const isCore =
      coreNames.includes(cardName);

    const isSynergy =
      !isCore &&
      synergyNames.includes(cardName);

    if (!isCore && !isSynergy) {
      continue;
    }

    const coreRatio =
      coreNames.filter(name =>
        availableNorms.has(name)
      ).length /
      coreNames.length;

    const synergyRatio =
      synergyNames.filter(name =>
        availableNorms.has(name)
      ).length /
      Math.max(
        synergyNames.length,
        1
      );

    if (isCore) {
      total +=
        synergyPackage.value *
        100 *
        (
          0.5 +
          coreRatio * 0.3 +
          synergyRatio * 0.2
        );
    } else {
      total +=
        synergyPackage.value *
        100 *
        0.5 *
        coreRatio;
    }
  }

  return Math.min(total, 50);
}

function popularityScore(rank) {
  if (!Number.isFinite(rank)) {
    return 0;
  }

  return 1 /
    Math.log(rank + 10);
}

// ---------- TAGS PARA EL BUILDER ----------
export function getCardTags(card) {
  const tags = [];

  const text = (
    card.oracle_text || ""
  ).toLowerCase();

  const type = (
    card.type_line || ""
  ).toLowerCase();

  if (type.includes("land")) {
    tags.push("land");
    return tags;
  }

  if (
    /\badd \{[WUBRGC]|search your library for.*(basic )?land|create.*(treasure|gold)|\{T\}.*add/i.test(
      text
    ) ||
    (
      type.includes("creature") &&
      /\{T\}.*add.*mana/i.test(text)
    )
  ) {
    tags.push("ramp");
  }

  if (
    /draw(s)? (a |one |two |three |\d+ )?card|exile the top.*you may (play|cast)|look at the top.*put.*into your hand/i.test(
      text
    )
  ) {
    tags.push("draw");
  }

  if (
    /destroy all|exile all|damage to each creature|all creatures get -|sacrifice all/i.test(
      text
    )
  ) {
    tags.push("wipe");
  } else if (
    /destroy target|exile target|return target.*hand|deals \d+ damage to (target|any)/i.test(
      text
    )
  ) {
    tags.push("removal");
  }

  if (
    /search your library for a(n)?(?!.*(basic land|forest|plains|island|swamp|mountain))/i.test(
      text
    )
  ) {
    tags.push("tutor");
  }

  if (
    /hexproof|indestructible|protection from|counter target spell/i.test(
      text
    )
  ) {
    tags.push("protection");
  }

  if (
    /return.*(from|in) your graveyard|reanimate|unearth|escape/i.test(
      text
    )
  ) {
    tags.push("recursion");
  }

  return tags;
}

// ---------- MAP BUILDERS ----------
export function buildCommanderSynergyMap(
  edhrecCards
) {
  const map = new Map();

  if (
    !Array.isArray(edhrecCards)
  ) {
    return map;
  }

  for (const card of edhrecCards) {
    if (card?.name) {
      map.set(
        normalizeCardName(
          card.name
        ),
        Number(card.synergy) || 0
      );
    }
  }

  return map;
}

export function buildCooccurrenceMap(
  edhrecCards
) {
  const map = new Map();

  if (
    !Array.isArray(edhrecCards)
  ) {
    return map;
  }

  let maximum = 1;

  for (const card of edhrecCards) {
    if (
      card?.num_decks > maximum
    ) {
      maximum =
        card.num_decks;
    }
  }

  for (const card of edhrecCards) {
    if (card?.name) {
      map.set(
        normalizeCardName(
          card.name
        ),
        (
          card.num_decks || 0
        ) /
        maximum
      );
    }
  }

  return map;
}

export function computeDeckSynergyMap(
  candidates,
  selectedCards
) {
  const map = new Map();

  const selectedMechanics =
    new Set();

  const selectedTypes =
    new Set();

  const selectedColors =
    new Set();

  for (
    const selected
    of selectedCards
  ) {
    const text = (
      selected.oracle_text || ""
    ).toLowerCase();

    for (
      const { pattern, group }
      of MECHANIC_GROUPS
    ) {
      if (pattern.test(text)) {
        selectedMechanics.add(
          group
        );
      }
    }

    const typeLine = (
      selected.type_line || ""
    ).toLowerCase();

    const subtypes =
      typeLine.split("—")[1] ||
      "";

    for (
      const part
      of subtypes.split(/[,\s]+/)
    ) {
      const clean =
        part.replace(
          /[^a-z]/g,
          ""
        );

      if (clean) {
        selectedTypes.add(clean);
      }
    }

    for (
      const color
      of selected.colors || []
    ) {
      selectedColors.add(color);
    }
  }

  for (const card of candidates) {
    let synergy = 0;

    const text = (
      card.oracle_text || ""
    ).toLowerCase();

    const typeLine = (
      card.type_line || ""
    ).toLowerCase();

    for (
      const { pattern, group }
      of MECHANIC_GROUPS
    ) {
      if (
        selectedMechanics.has(
          group
        ) &&
        pattern.test(text)
      ) {
        synergy += 0.25;
      }
    }

    for (
      const color
      of card.colors || []
    ) {
      if (
        selectedColors.has(color)
      ) {
        synergy += 0.02;
      }
    }

    for (
      const type
      of selectedTypes
    ) {
      if (
        text.includes(type) ||
        typeLine.includes(type)
      ) {
        synergy += 0.12;
      }
    }

    map.set(
      normalizeCardName(
        card.name
      ),
      synergy
    );
  }

  return map;
}

// ---------- SCORE PRINCIPAL ----------
export function computeCardScore({
  card,
  collectionCounts,
  commanderProfile,
  commanderSynergyMap = new Map(),
  deckSynergyMap = new Map(),
  cooccurrenceMap = new Map(),
  theme = "none",
  availableNorms = new Set(),
}) {
  const name =
    normalizeCardName(card.name);

  let score = 0;

  if (commanderProfile) {
    score +=
      computeProfileRelevance(
        card,
        commanderProfile,
        theme
      ) * 120;
  }

  if (
    collectionCounts.has(name)
  ) {
    score += 50;
  }

  score +=
    (
      commanderSynergyMap.get(
        name
      ) ?? 0
    ) * 40;

  score +=
    (
      deckSynergyMap.get(
        name
      ) ?? 0
    ) * 30;

  score +=
    (
      cooccurrenceMap.get(
        name
      ) ?? 0
    ) * 20;

  score +=
    popularityScore(
      card.edhrec_rank
    ) * 12;

  score +=
    evaluateManaEfficiency(card);

  score +=
    evaluateCombatKeywords(
      card
    ) * 0.5;

  score +=
    evaluateVersatility(
      card
    ) * 0.6;

  score +=
    evaluatePenalties(card);

  if (availableNorms.size > 0) {
    score +=
      evaluateComboValue(
        card,
        availableNorms
      );

    score +=
      evaluateSynergyPackage(
        card,
        availableNorms
      );
  }

  return score;
}

// ---------- SORT ----------
export function sortByScore({
  cards,
  collectionCounts,
  commanderProfile,
  commanderSynergyMap,
  deckSynergyMap,
  cooccurrenceMap,
  theme,
}) {
  const availableNorms =
    new Set(
      cards.map(card =>
        normalizeCardName(
          card.name
        )
      )
    );

  return [...cards].sort(
    (cardA, cardB) =>
      computeCardScore({
        card: cardB,
        collectionCounts,
        commanderProfile,
        commanderSynergyMap,
        deckSynergyMap,
        cooccurrenceMap,
        theme,
        availableNorms,
      }) -
      computeCardScore({
        card: cardA,
        collectionCounts,
        commanderProfile,
        commanderSynergyMap,
        deckSynergyMap,
        cooccurrenceMap,
        theme,
        availableNorms,
      })
  );
}

// ---------- SORT ITERATIVO ----------
export function sortByScoreIterative({
  cards,
  collectionCounts,
  commanderProfile,
  commanderSynergyMap,
  cooccurrenceMap,
  theme,
  commander,
  iterations = 3,
  topN = 150,
}) {
  let selected =
    commander
      ? [commander]
      : [];

  let deckSynergyMap =
    computeDeckSynergyMap(
      cards,
      selected
    );

  let ordered =
    sortByScore({
      cards,
      collectionCounts,
      commanderProfile,
      commanderSynergyMap,
      deckSynergyMap,
      cooccurrenceMap,
      theme,
    });

  for (
    let index = 0;
    index < iterations;
    index++
  ) {
    selected = [
      ...(
        commander
          ? [commander]
          : []
      ),
      ...ordered.slice(0, topN),
    ];

    deckSynergyMap =
      computeDeckSynergyMap(
        cards,
        selected
      );

    ordered =
      sortByScore({
        cards,
        collectionCounts,
        commanderProfile,
        commanderSynergyMap,
        deckSynergyMap,
        cooccurrenceMap,
        theme,
      });
  }

  return ordered;
}

// ---------- CONSTRUCTOR CONSISTENTE ----------
const FUNCTIONAL_ROLES = [
  "ramp",
  "draw",
  "removal",
  "wipe",
  "tutor",
  "protection",
  "recursion",
];

function cardMechanics(card) {
  const result = new Set();

  const text = (
    card.oracle_text || ""
  ).toLowerCase();

  for (
    const { pattern, group }
    of MECHANIC_GROUPS
  ) {
    if (pattern.test(text)) {
      result.add(group);
    }
  }

  return result;
}

function chooseBestRole(
  card,
  counts,
  targets
) {
  const tags =
    getCardTags(card).filter(
      tag =>
        FUNCTIONAL_ROLES.includes(
          tag
        )
    );

  let best = null;
  let bestNeed = 0;

  for (const role of tags) {
    const target = Math.max(
      0,
      Number(targets[role]) || 0
    );

    if (!target) {
      continue;
    }

    const need =
      Math.max(
        0,
        target -
          (counts[role] || 0)
      ) /
      target;

    if (need > bestNeed) {
      bestNeed = need;
      best = role;
    }
  }

  return {
    role: best,
    need: bestNeed,
  };
}

function curvePenalty(
  card,
  selected
) {
  const cmc =
    Number(card.cmc) || 0;

  if (cmc <= 3) {
    return 0;
  }

  const expensive =
    selected.filter(
      selectedCard =>
        (
          Number(
            selectedCard.cmc
          ) || 0
        ) >= 5
    ).length;

  const allowed = Math.max(
    5,
    Math.floor(
      (
        selected.length + 1
      ) * 0.18
    )
  );

  return expensive >= allowed
    ? (cmc - 3) * 4
    : (cmc - 3) * 0.8;
}

function redundancyPenalty(
  card,
  selected
) {
  const mechanics =
    cardMechanics(card);

  if (
    !mechanics.size ||
    selected.length < 8
  ) {
    return 0;
  }

  const counts = new Map();

  for (
    const chosen of selected
  ) {
    for (
      const mechanic
      of cardMechanics(chosen)
    ) {
      counts.set(
        mechanic,
        (
          counts.get(mechanic) ||
          0
        ) + 1
      );
    }
  }

  let penalty = 0;

  for (
    const mechanic
    of mechanics
  ) {
    const ratio =
      (
        counts.get(mechanic) ||
        0
      ) /
      selected.length;

    if (ratio > 0.45) {
      penalty +=
        (ratio - 0.45) * 18;
    }
  }

  return penalty;
}

/**
 * Construye el bloque no-tierra valorando
 * cada incorporación respecto al mazo
 * ya elegido.
 *
 * Los combos y paquetes solo cuentan
 * cuando sus piezas están realmente
 * seleccionadas.
 */
export function buildConsistentNonLandDeck({
  cards,
  targetCount,
  roleTargets,
  collectionCounts,
  commanderProfile,
  commanderSynergyMap = new Map(),
  cooccurrenceMap = new Map(),
  theme = "none",
  commander = null,
  maxBudget = 0,
  startingCost = 0,
  maxPriceLimit = Infinity,
  prefilterSize = 360,
}) {
  const emptySynergy =
    new Map();

  const baseOrdered = [
    ...cards,
  ]
    .sort(
      (cardA, cardB) =>
        computeCardScore({
          card: cardB,
          collectionCounts,
          commanderProfile,
          commanderSynergyMap,
          deckSynergyMap:
            emptySynergy,
          cooccurrenceMap,
          theme,
          availableNorms:
            new Set(),
        }) -
        computeCardScore({
          card: cardA,
          collectionCounts,
          commanderProfile,
          commanderSynergyMap,
          deckSynergyMap:
            emptySynergy,
          cooccurrenceMap,
          theme,
          availableNorms:
            new Set(),
        })
    )
    .slice(
      0,
      Math.max(
        targetCount * 3,
        prefilterSize
      )
    );

  const selected = [];

  const remaining = new Map(
    baseOrdered.map(card => [
      normalizeCardName(
        card.name
      ),
      card,
    ])
  );

  const counts =
    Object.fromEntries(
      FUNCTIONAL_ROLES.map(
        role => [role, 0]
      )
    );

  let cost = startingCost;

  while (
    selected.length <
      targetCount &&
    remaining.size
  ) {
    const selectedContext =
      commander
        ? [
            commander,
            ...selected,
          ]
        : selected;

    const deckSynergyMap =
      computeDeckSynergyMap(
        [
          ...remaining.values(),
        ],
        selectedContext
      );

    const selectedNorms =
      new Set(
        selectedContext.map(card =>
          normalizeCardName(
            card.name
          )
        )
      );

    let best = null;

    for (
      const card
      of remaining.values()
    ) {
      const name =
        normalizeCardName(
          card.name
        );

      const owned =
        collectionCounts.has(name);

      const price = owned
        ? 0
        : Number.parseFloat(
            card.prices?.usd ||
              "0"
          ) || 0;

      if (
        price > maxPriceLimit
      ) {
        continue;
      }

      if (
        maxBudget > 0 &&
        cost + price >
          maxBudget
      ) {
        continue;
      }

      const { role, need } =
        chooseBestRole(
          card,
          counts,
          roleTargets
        );

      const availableNorms =
        new Set(selectedNorms);

      availableNorms.add(name);

      let score =
        computeCardScore({
          card,
          collectionCounts,
          commanderProfile,
          commanderSynergyMap,
          deckSynergyMap,
          cooccurrenceMap,
          theme,
          availableNorms,
        });

      score += need * 55;

      score -= curvePenalty(
        card,
        selected
      );

      score -=
        redundancyPenalty(
          card,
          selected
        );

      const missingRoles =
        FUNCTIONAL_ROLES.some(
          functionalRole =>
            (
              counts[
                functionalRole
              ] || 0
            ) <
            (
              Number(
                roleTargets[
                  functionalRole
                ]
              ) || 0
            )
        );

      if (
        !role &&
        missingRoles
      ) {
        score -= 18;
      }

      if (
        !best ||
        score > best.score
      ) {
        best = {
          card,
          score,
          role,
          price,
        };
      }
    }

    if (!best) {
      break;
    }

    const chosen = {
      ...best.card,

      _assignedRole:
        best.role ||
        "flex synergy",

      _selectionScore:
        best.score,
    };

    selected.push(chosen);

    if (best.role) {
      counts[best.role]++;
    }

    cost += best.price;

    remaining.delete(
      normalizeCardName(
        best.card.name
      )
    );
  }

  return {
    cards: selected,
    cost,
    roleCounts: counts,
  };
}

// ---------- EVALUACIÓN GLOBAL ----------
function countDeckRoles(cards) {
  const counts =
    Object.fromEntries(
      FUNCTIONAL_ROLES.map(
        role => [role, 0]
      )
    );

  for (const card of cards) {
    const assigned =
      card._assignedRole;

    if (
      FUNCTIONAL_ROLES.includes(
        assigned
      )
    ) {
      counts[assigned]++;
      continue;
    }

    for (
      const tag
      of getCardTags(card)
    ) {
      if (
        FUNCTIONAL_ROLES.includes(
          tag
        )
      ) {
        counts[tag]++;
      }
    }
  }

  return counts;
}

function scoreRoleCoverage(
  cards,
  roleTargets
) {
  const counts =
    countDeckRoles(cards);

  let score = 0;

  for (
    const role
    of FUNCTIONAL_ROLES
  ) {
    const target = Math.max(
      0,
      Number(
        roleTargets?.[role]
      ) || 0
    );

    if (!target) {
      continue;
    }

    const count =
      counts[role] || 0;

    score +=
      (
        Math.min(
          count,
          target
        ) /
        target
      ) * 24;

    if (count < target) {
      score -=
        (target - count) * 13;
    }

    if (
      count >
      target * 1.8
    ) {
      score -=
        (
          count -
          target * 1.8
        ) * 2;
    }
  }

  return {
    score,
    counts,
  };
}

function scoreManaCurve(cards) {
  const nonLands =
    cards.filter(
      card =>
        !(
          card.type_line || ""
        )
          .toLowerCase()
          .includes("land")
    );

  if (!nonLands.length) {
    return 0;
  }

  const manaValues =
    nonLands.map(
      card =>
        Number(card.cmc) || 0
    );

  const average =
    manaValues.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    manaValues.length;

  const expensiveRatio =
    manaValues.filter(
      value => value >= 5
    ).length /
    manaValues.length;

  const cheapRatio =
    manaValues.filter(
      value => value <= 2
    ).length /
    manaValues.length;

  let score = 28;

  score -=
    Math.abs(
      average - 3.15
    ) * 9;

  if (
    expensiveRatio > 0.23
  ) {
    score -=
      (
        expensiveRatio -
        0.23
      ) * 100;
  }

  if (cheapRatio < 0.22) {
    score -=
      (
        0.22 -
        cheapRatio
      ) * 65;
  }

  return score;
}

function scoreMechanicBalance(
  cards
) {
  if (!cards.length) {
    return 0;
  }

  const counts = new Map();

  for (const card of cards) {
    for (
      const mechanic
      of cardMechanics(card)
    ) {
      counts.set(
        mechanic,
        (
          counts.get(mechanic) ||
          0
        ) + 1
      );
    }
  }

  let score = 0;

  for (
    const count
    of counts.values()
  ) {
    const ratio =
      count / cards.length;

    if (count >= 4) {
      score +=
        Math.min(
          count,
          12
        ) * 0.8;
    }

    if (ratio > 0.52) {
      score -=
        (
          ratio - 0.52
        ) * 70;
    }
  }

  return score;
}

function scorePackageCompleteness(
  cards
) {
  const names =
    new Set(
      cards.map(card =>
        normalizeCardName(
          card.name
        )
      )
    );

  let score = 0;

  for (
    const combo
    of knownCombos
  ) {
    const pieces =
      combo.pieces.map(
        normalizeCardName
      );

    const present =
      pieces.filter(piece =>
        names.has(piece)
      ).length;

    if (
      present === pieces.length
    ) {
      score +=
        combo.value * 0.9;
    } else if (present > 0) {
      score -=
        combo.value *
        0.35 *
        (
          present /
          pieces.length
        );
    }
  }

  for (
    const synergyPackage
    of synergyPackages
  ) {
    const core =
      synergyPackage.core.map(
        normalizeCardName
      );

    const support =
      synergyPackage.synergizes.map(
        normalizeCardName
      );

    const coreCount =
      core.filter(name =>
        names.has(name)
      ).length;

    const supportCount =
      support.filter(name =>
        names.has(name)
      ).length;

    if (
      coreCount &&
      supportCount
    ) {
      score +=
        (
          coreCount * 3 +
          supportCount * 1.5
        ) *
        synergyPackage.value *
        10;
    } else if (
      coreCount &&
      !supportCount
    ) {
      score -=
        coreCount *
        synergyPackage.value *
        8;
    }
  }

  return score;
}

function scoreCommanderAlignment(
  cards,
  commanderProfile,
  theme
) {
  if (
    !cards.length ||
    !commanderProfile
  ) {
    return 0;
  }

  const relevance =
    cards.reduce(
      (sum, card) =>
        sum +
        computeProfileRelevance(
          card,
          commanderProfile,
          theme
        ),
      0
    );

  return (
    relevance /
    cards.length *
    45
  );
}

/**
 * Puntúa la coherencia del mazo
 * como conjunto, no carta a carta.
 */
export function scoreWholeDeck({
  cards,
  roleTargets = {},
  commanderProfile = null,
  theme = "none",
}) {
  const roleResult =
    scoreRoleCoverage(
      cards,
      roleTargets
    );

  const breakdown = {
    roles: roleResult.score,

    curve:
      scoreManaCurve(cards),

    mechanics:
      scoreMechanicBalance(
        cards
      ),

    packages:
      scorePackageCompleteness(
        cards
      ),

    commander:
      scoreCommanderAlignment(
        cards,
        commanderProfile,
        theme
      ),
  };

  const total =
    Object.values(
      breakdown
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    );

  return {
    total,
    breakdown,
    roleCounts:
      roleResult.counts,
  };
}

// ---------- SWAPS ----------
function cardPurchasePrice(
  card,
  collectionCounts
) {
  if (
    collectionCounts?.has(
      normalizeCardName(
        card.name
      )
    )
  ) {
    return 0;
  }

  return (
    Number.parseFloat(
      card.prices?.usd || "0"
    ) || 0
  );
}

function assignBestRoleForDeck(
  card,
  cardsWithoutCandidate,
  roleTargets
) {
  const counts =
    countDeckRoles(
      cardsWithoutCandidate
    );

  return (
    chooseBestRole(
      card,
      counts,
      roleTargets
    ).role ||
    "flex synergy"
  );
}

/**
 * Mejora un bloque no-tierra mediante
 * intercambios uno por uno.
 *
 * Solo conserva cambios que aumentan
 * la puntuación global y respeta el
 * presupuesto configurado.
 */
export function improveDeckWithSwaps({
  deck,
  candidates,
  roleTargets,
  commanderProfile,
  theme = "none",
  collectionCounts = new Map(),
  maxBudget = 0,
  landCost = 0,
  maxPasses = 4,
  candidateLimit = 100,
}) {
  let currentDeck =
    deck.map(card => ({
      ...card,
    }));

  let currentEvaluation =
    scoreWholeDeck({
      cards: currentDeck,
      roleTargets,
      commanderProfile,
      theme,
    });

  let currentCost =
    landCost +
    currentDeck.reduce(
      (sum, card) =>
        sum +
        cardPurchasePrice(
          card,
          collectionCounts
        ),
      0
    );

  const selectedNames =
    new Set(
      currentDeck.map(card =>
        normalizeCardName(
          card.name
        )
      )
    );

  let excluded =
    candidates
      .filter(
        card =>
          !selectedNames.has(
            normalizeCardName(
              card.name
            )
          )
      )
      .slice(0, candidateLimit)
      .map(card => ({
        ...card,
      }));

  let swaps = 0;

  for (
    let pass = 0;
    pass < maxPasses;
    pass++
  ) {
    let bestSwap = null;

    for (
      let deckIndex = 0;
      deckIndex <
      currentDeck.length;
      deckIndex++
    ) {
      const removed =
        currentDeck[deckIndex];

      const removedPrice =
        cardPurchasePrice(
          removed,
          collectionCounts
        );

      const withoutRemoved =
        currentDeck.filter(
          (_, index) =>
            index !== deckIndex
        );

      for (
        let candidateIndex = 0;
        candidateIndex <
        excluded.length;
        candidateIndex++
      ) {
        const addedBase =
          excluded[
            candidateIndex
          ];

        const addedPrice =
          cardPurchasePrice(
            addedBase,
            collectionCounts
          );

        const candidateCost =
          currentCost -
          removedPrice +
          addedPrice;

        if (
          maxBudget > 0 &&
          candidateCost >
            maxBudget
        ) {
          continue;
        }

        const added = {
          ...addedBase,

          _assignedRole:
            assignBestRoleForDeck(
              addedBase,
              withoutRemoved,
              roleTargets
            ),
        };

        const candidateDeck = [
          ...withoutRemoved,
          added,
        ];

        const evaluation =
          scoreWholeDeck({
            cards:
              candidateDeck,
            roleTargets,
            commanderProfile,
            theme,
          });

        const improvement =
          evaluation.total -
          currentEvaluation.total;

        if (
          improvement > 0.25 &&
          (
            !bestSwap ||
            improvement >
              bestSwap.improvement
          )
        ) {
          bestSwap = {
            deckIndex,
            candidateIndex,
            removed,
            added,
            candidateCost,
            evaluation,
            improvement,
          };
        }
      }
    }

    if (!bestSwap) {
      break;
    }

    currentDeck[
      bestSwap.deckIndex
    ] = bestSwap.added;

    excluded[
      bestSwap.candidateIndex
    ] = bestSwap.removed;

    currentCost =
      bestSwap.candidateCost;

    currentEvaluation =
      bestSwap.evaluation;

    swaps++;
  }

  return {
    cards: currentDeck,
    cost: currentCost,
    score:
      currentEvaluation.total,

    scoreBreakdown:
      currentEvaluation.breakdown,

    roleCounts:
      currentEvaluation.roleCounts,

    swaps,
  };
}