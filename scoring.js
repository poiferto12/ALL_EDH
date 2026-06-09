// scoring.js - Sistema de puntuación para Commander

// ---------- UTIL ----------
export function normalizeCardName(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------- TIPOS DE CRIATURA ----------
const CREATURE_TYPES = new Set([
  'angel','demon','dragon','zombie','vampire','elf','goblin','merfolk',
  'ally',
  'wizard','warrior','knight','cleric','rogue','shaman','druid','monk',
  'beast','bird','cat','dinosaur','elemental','faerie','giant','golem',
  'human','hydra','insect','minotaur','phoenix','pirate','plant','rat',
  'saproling','serpent','skeleton','sliver','soldier','sphinx','spirit',
  'treefolk','wolf','wurm','construct','horror','illusion','kithkin',
  'leviathan','ooze','pegasus','praetor','shade','shapeshifter','spawn',
  'specter','thrull','troll','unicorn','archer','assassin','berserker',
  'centaur','djinn','dryad','fungus','gorgon','homunculus','imp','kavu',
  'lizard','ninja','ogre','orc','scorpion','spider','squid','turtle',
  'naga','viashino','vedalken','gnome','mutant','avatar',
]);

// ---------- MECÁNICAS ----------
const MECHANIC_GROUPS = [
  { pattern: /\bally\b/i,                     group: 'ally' },
  { pattern: /\+1\/\+1 counter/i,              group: 'counters' },
  { pattern: /proliferate/i,                   group: 'counters' },
  { pattern: /create.*token/i,                 group: 'tokens' },
  { pattern: /populate/i,                      group: 'tokens' },
  { pattern: /\bsacrifice\b/i,                 group: 'sacrifice' },
  { pattern: /when.*dies/i,                    group: 'sacrifice' },
  { pattern: /graveyard/i,                     group: 'graveyard' },
  { pattern: /flashback|unearth|escape/i,      group: 'graveyard' },
  { pattern: /whenever you cast/i,             group: 'spells' },
  { pattern: /magecraft/i,                     group: 'spells' },
  { pattern: /copy.*spell/i,                   group: 'spells' },
  { pattern: /when.*enters/i,                  group: 'etb' },
  { pattern: /flicker|blink/i,                 group: 'blink' },
  { pattern: /\bequip\b|equipment/i,           group: 'equipment' },
  { pattern: /enchant creature|aura/i,         group: 'auras' },
  { pattern: /gain.*life|lifelink/i,           group: 'lifegain' },
  { pattern: /whenever.*gain.*life/i,          group: 'lifegain' },
  { pattern: /draw.*card/i,                    group: 'draw' },
  { pattern: /wheel.*each player draws/i,      group: 'wheels' },
  { pattern: /add \{[WUBRGC]/i,               group: 'ramp' },
  { pattern: /search.*land/i,                  group: 'ramp' },
  { pattern: /\bartifact\b/i,                  group: 'artifacts' },
  { pattern: /treasure/i,                      group: 'treasure' },
  { pattern: /\benchantment\b/i,               group: 'enchantments' },
  { pattern: /constellation/i,                 group: 'enchantments' },
  { pattern: /whenever.*attacks/i,             group: 'attack-triggers' },
  { pattern: /additional combat/i,             group: 'combat' },
  { pattern: /landfall/i,                      group: 'landfall' },
  { pattern: /\bmill\b/i,                      group: 'mill' },
  { pattern: /deals.*damage.*each/i,           group: 'ping' },
  { pattern: /whenever.*deals damage/i,        group: 'ping' },
];

// ---------- STAPLES UNIVERSALES ----------
const UNIVERSAL_STAPLES = new Set([
  'solring','arcanesignet','commandtower','lightninggreaves','swiftfootboots',
  'swordstoplowshares','pathtoexi','counterspell','cyclonicrift','demonictutor',
  'vampirictutor','rhysticstudy','smotheringtithe','docksideextortionist',
  'fierceguardianship','deflectingswat','deadlyrollick','jeskaswill',
  'espersentinel','manacrypt','manavault','sylvanlibrary','necropotence',
  'cultivate','kodamasreach','farseek','natureslore','beastwith','chaoswarp',
  'generousgift','anguishedunmaking','toxicdeluge','blasphemousact',
  'vandalblast','farewell',
]);

// Nombres de tierras básicas
const BASIC_LAND_NAMES = new Set(['plains','island','swamp','mountain','forest','wastes']);

// ---------- ANALIZAR COMANDANTE ----------
export function analyzeCommander(commander) {
  const text  = (commander.oracle_text || '').toLowerCase();
  const type  = (commander.type_line   || '').toLowerCase();
  const colors = commander.color_identity || [];

  const profile = {
    tribes:    new Set(),
    mechanics: new Set(),
    colors,
    careAboutCreatureType: false,
    careAboutSpells:       false,
    careAboutGraveyard:    false,
    careAboutTokens:       false,
    careAboutCounters:     false,
    careAboutArtifacts:    false,
    careAboutEnchantments: false,
    careAboutLandfall:     false,
    careAboutLifegain:     false,
    careAboutSacrifice:    false,
    careAboutETB:          false,
    careAboutEquipment:    false,
    careAboutPing:         false,
  };

  const extractTribe = raw => {
    const clean = raw.trim().toLowerCase().replace(/[^a-z'-]/g, '');
    return CREATURE_TYPES.has(clean) ? clean : null;
  };

  const explicitTribes = new Set();
  const tribePatterns = [
    /(?:another|other|each|every|a|an)\s+([a-z'-]+)s?\s+(?:you control|you have|you cast|enters|dies|attacks|blocks|deals|triggers|is|has)/ig,
    /\b([a-z'-]+)s?\s+you control\b/ig,
    /\b(?:of|for|with) an?\s+([a-z'-]+)\s+you control\b/ig,
    /\bwhenever an?\s+([a-z'-]+)s?\b/ig,
  ];

  for (const pattern of tribePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const tribe = extractTribe(match[1] || '');
      if (tribe) explicitTribes.add(tribe);
    }
  }

  if (explicitTribes.size > 0) {
    for (const tribe of explicitTribes) profile.tribes.add(tribe);
  } else {
    const subtypeText = type.split('—')[1] || '';
    for (const part of subtypeText.split(/[, ]+/)) {
      const tribe = extractTribe(part);
      if (tribe) profile.tribes.add(tribe);
    }
  }

  for (const { pattern, group } of MECHANIC_GROUPS) {
    if (pattern.test(text)) profile.mechanics.add(group);
  }

  profile.careAboutCreatureType = profile.tribes.size > 0;
  profile.careAboutSpells       = profile.mechanics.has('spells');
  profile.careAboutGraveyard    = profile.mechanics.has('graveyard');
  profile.careAboutTokens       = profile.mechanics.has('tokens');
  profile.careAboutCounters     = profile.mechanics.has('counters');
  profile.careAboutArtifacts    = profile.mechanics.has('artifacts') || profile.mechanics.has('treasure');
  profile.careAboutEnchantments = profile.mechanics.has('enchantments');
  profile.careAboutLandfall     = profile.mechanics.has('landfall');
  profile.careAboutLifegain     = profile.mechanics.has('lifegain');
  profile.careAboutSacrifice    = profile.mechanics.has('sacrifice');
  profile.careAboutETB          = profile.mechanics.has('etb') || profile.mechanics.has('blink');
  profile.careAboutEquipment    = profile.mechanics.has('equipment') || profile.mechanics.has('auras');
  profile.careAboutPing         = profile.mechanics.has('ping');

  return profile;
}

// ---------- RELEVANCIA DE TIERRA ----------
function computeLandRelevance(card, profile) {
  const text = (card.oracle_text || '').toLowerCase();
  const name = (card.name        || '').toLowerCase().trim();

  // Tierras básicas: siempre buenas
  if (BASIC_LAND_NAMES.has(name)) return 0.55;

  // Tierras fetches (buscan tierras básicas al campo)
  if (/search your library for a (basic )?land/i.test(text)) return 0.6;

  // Tierras fijas excelentes en Commander multicolor
  if (/command tower|exotic orchard|reflecting pool|city of brass|mana confluence/i.test(name)) return 0.65;

  // Tierra dual/shock/filter: produce los colores del comandante
  const colorWordMap = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
  let colorMatches = 0;
  for (const c of profile.colors) {
    const word = colorWordMap[c];
    if (word && text.includes(word)) colorMatches++;
  }
  if (colorMatches >= 2) return 0.55;
  if (colorMatches === 1) return 0.4;

  // If the commander has a colored identity, deprioritize lands that only produce colorless
  if (profile.colors && profile.colors.length > 0) {
    // If the land explicitly produces only colorless mana or mentions {C}, penalize it
    if (/\{c\}|colorless/i.test(text)) return 0.02;
    // If it doesn't explicitly match any commander color and isn't a fetch/fix land, give low relevance
    if (colorMatches === 0) return 0.08;
  }

  // Tierra de utilidad que produce {C} o colorless (no commander colors)
  if (/\{c\}|colorless/i.test(text)) return 0.1;

  // Tierra sin producción de color del comandante: poco útil
  return 0.05;
}

// ---------- RELEVANCIA PARA EL PERFIL ----------
export function computeProfileRelevance(card, profile, theme) {
  const text = (card.oracle_text || '').toLowerCase();
  const type = (card.type_line   || '').toLowerCase();
  const name = normalizeCardName(card.name);

  if (type.includes('land')) return computeLandRelevance(card, profile);

  let score = 0;
  let hits  = 0;

  // Staples universales
  if (UNIVERSAL_STAPLES.has(name)) { score += 0.25; hits++; }

  // Ramp y draw: soporte neutral siempre aceptado
  const isRamp = /add \{[WUBRGC]|search.*land|\{t\}.*add/i.test(text) && !type.includes('land');
  const isDraw = /draw.*card|look at.*top.*hand/i.test(text);
  if (isRamp || isDraw) { score += 0.15; hits++; }

  // Tribal
  if (profile.careAboutCreatureType) {
    for (const tribe of profile.tribes) {
      if (text.includes(tribe) || type.includes(tribe)) { score += 0.65; hits++; }
    }
  }

  // Mecánicas del comandante
  for (const { pattern, group } of MECHANIC_GROUPS) {
    if (profile.mechanics.has(group) && pattern.test(text)) { score += 0.3; hits++; }
  }

  // Señales específicas
  if (profile.careAboutCounters     && /\+1\/\+1 counter|proliferate/i.test(text))               { score += 0.35; hits++; }
  if (profile.careAboutTokens       && /create.*token|token.*you control/i.test(text))            { score += 0.35; hits++; }
  if (profile.careAboutGraveyard    && /graveyard|reanimate|flashback|unearth/i.test(text))       { score += 0.35; hits++; }
  if (profile.careAboutSpells       && /instant|sorcery|whenever you cast|magecraft/i.test(text)) { score += 0.3;  hits++; }
  if (profile.careAboutLifegain     && /gain.*life|lifelink|whenever.*gain life/i.test(text))     { score += 0.35; hits++; }
  if (profile.careAboutSacrifice    && /sacrifice|when.*dies/i.test(text))                        { score += 0.35; hits++; }
  if (profile.careAboutETB          && /when.*enters|flicker|blink/i.test(text))                  { score += 0.3;  hits++; }
  if (profile.careAboutArtifacts    && /\bartifact\b|treasure/i.test(text))                       { score += 0.3;  hits++; }
  if (profile.careAboutEnchantments && /\benchantment\b|constellation/i.test(text))               { score += 0.3;  hits++; }
  if (profile.careAboutLandfall     && /landfall|land.*enters.*battlefield/i.test(text))          { score += 0.4;  hits++; }
  if (profile.careAboutEquipment    && /equip|equipment|enchant creature/i.test(text))            { score += 0.35; hits++; }
  if (profile.careAboutPing         && /whenever.*deals damage|deals.*damage.*each/i.test(text))  { score += 0.3;  hits++; }
  if (profile.mechanics.has('ally') && (type.includes('ally') || /\bally\b/i.test(text)))  { score += 0.45; hits++; }

  // Tema del usuario
  if (theme && theme !== 'none' && themePatterns[theme]) {
    const cfg = themePatterns[theme];
    if (cfg.core.test(text) || cfg.core.test(type))  { score += 0.4; hits++; }
    else if (cfg.support?.test(text))                 { score += 0.2; hits++; }
  }

  if (hits === 0) return -0.25;
  return Math.min(score, 1.0);
}

// ---------- TEMAS ----------
const themePatterns = {
  voltron:     { core: /\b(equip|enchant creature|aura|attached|equipped creature gets|enchanted creature)/i,   support: /\b(double strike|hexproof|indestructible|protection from)/i },
  lifegain:    { core: /\b(gain(s)? life|lifelink|whenever you gain life|life total)/i,                          support: /\b(angel|cleric|life.*greater)/i },
  tokens:      { core: /\b(create(s)?.*token|populate|token(s)? (you control|creature))/i,                       support: /\b(doubling season|parallel lives|anointed procession|convoke)/i },
  aristocrats: { core: /\b(sacrifice(s)?|when(ever)?.*dies)/i,                                                   support: /\b(drain|fodder|persist|undying|grave pact)/i },
  burn:        { core: /\b(deal(s)?.*damage to (target|each|any))/i,                                             support: /\b(guttersnipe|firebrand|goblin)/i },
  storm:       { core: /\b(instant(s)? (or|and) sorceries?|copy target spell|storm|magecraft)/i,                support: /\b(cost.*less|prowess|spellslinger)/i },
  artifacts:   { core: /\b(artifact(s)?|treasure|clue|historic|metalcraft|affinity)/i,                           support: /\b(improvise|modular|equipment|vehicle)/i },
  graveyard:   { core: /\b(graveyard|mill|reanimate|dredge|escape|flashback|unearth)/i,                          support: /\b(delve|threshold|delirium|entomb)/i },
  aggro:       { core: /\b(haste|attack(s|ing)|combat|\+\d\/|battalion|raid)/i,                                  support: /\b(menace|trample|first strike|double strike)/i },
  control:     { core: /\b(counter target|destroy all|exile all|board wipe)/i,                                   support: /\b(draw.*card|scry|flash)/i },
  ramp:        { core: /\b(add \{|search.*land|mana dork|mana rock)/i,                                           support: /\b(cultivate|kodama|exploration)/i },
  counters:    { core: /\b(\+1\/\+1 counter|proliferate|-1\/-1 counter)/i,                                       support: /\b(modular|graft|evolve|mentor)/i },
  enchantress: { core: /\b(enchantment|aura|constellation|whenever.*enchantment)/i,                              support: /\b(enchantress|shrine|saga)/i },
  tribal:      { core: /\b(creatures? you control (get|have)|creature type|changeling)/i,                        support: /\b(lord|anthem|kindred|tribal)/i },
};

// ---------- COMBOS ----------
const knownCombos = [
  { pieces: ['peregrine drake','deadeye navigator'],           support: ['palinchron','great whale'],                                         value: 30 },
  { pieces: ['dramatic reversal','isochron scepter'],          support: ['sol ring','mana vault','arcane signet'],                            value: 35 },
  { pieces: ['basalt monolith','rings of brighthearth'],       support: ['power artifact'],                                                  value: 28 },
  { pieces: ['dockside extortionist','temur sabertooth'],      support: ['cloudstone curio'],                                                value: 32 },
  { pieces: ['worldgorger dragon','animate dead'],             support: ['dance of the dead','necromancy'],                                   value: 30 },
  { pieces: ['kiki-jiki, mirror breaker','zealous conscripts'],support: ['splinter twin','pestermite','deceiver exarch','felidar guardian'],  value: 35 },
  { pieces: ['reveillark','karmic guide'],                     support: ['fiend hunter','altar of dementia','viscera seer'],                  value: 28 },
  { pieces: ["nim deathmantle","ashnod's altar"],              support: ['grave titan','wurmcoil engine'],                                   value: 25 },
  { pieces: ['niv-mizzet, parun','curiosity'],                 support: ['niv-mizzet, the firemind','ophidian eye','tandem lookout'],        value: 30 },
  { pieces: ['exquisite blood','sanguine bond'],               support: ['vito, thorn of the dusk rose'],                                    value: 28 },
  { pieces: ['mikaeus, the unhallowed','triskelion'],          support: ['walking ballista','murderous redcap'],                             value: 32 },
  { pieces: ["heliod, sun-crowned",'walking ballista'],        support: ['spike feeder'],                                                   value: 30 },
  { pieces: ["thassa's oracle",'demonic consultation'],        support: ['tainted pact','laboratory maniac'],                                value: 40 },
  { pieces: ["painter's servant",'grindstone'],                support: [],                                                                 value: 28 },
  { pieces: ['time warp','archaeomancer'],                     support: ['ghostly flicker','displace'],                                      value: 30 },
  { pieces: ['gravecrawler','phyrexian altar'],                support: ['blood artist','zulaport cutthroat'],                               value: 30 },
  { pieces: ['devoted druid','vizier of remedies'],            support: [],                                                                 value: 28 },
  { pieces: ['spike feeder','archangel of thune'],             support: [],                                                                 value: 26 },
];

// ---------- PAQUETES ----------
const synergyPackages = [
  { core: ["conjurer's closet","panharmonicon","thassa, deep-dwelling"],    synergizes: ['mulldrifter','cloudblazer','ravenous chupacabra','eternal witness'], value: 0.20 },
  { core: ['doubling season','parallel lives','anointed procession'],        synergizes: ['avenger of zendikar','tendershoot dryad'],                          value: 0.22 },
  { core: ["viscera seer","ashnod's altar","phyrexian altar"],               synergizes: ['grave pact','dictate of erebos','blood artist','zulaport cutthroat'],value: 0.22 },
  { core: ['reanimate','animate dead','necromancy'],                         synergizes: ['entomb','buried alive','faithless looting'],                         value: 0.20 },
  { core: ['thousand-year storm','storm-kiln artist'],                       synergizes: ['aetherflux reservoir','guttersnipe'],                                value: 0.22 },
  { core: ['wheel of fortune','windfall','whispering madness'],              synergizes: ['notion thief','narset, parter of veils','smothering tithe'],         value: 0.20 },
  { core: ["enchantress's presence",'argothian enchantress'],                synergizes: ['sigil of the empty throne','sphere of safety'],                      value: 0.20 },
  { core: ['hardened scales','doubling season','branching evolution'],        synergizes: ['walking ballista','hangarback walker','kalonian hydra'],              value: 0.20 },
  { core: ['stoneforge mystic','puresteel paladin','sram, senior edificer'],  synergizes: ['sword of feast and famine','sword of fire and ice','batterskull'],   value: 0.20 },
  { core: ['smothering tithe','dockside extortionist','goldspan dragon'],     synergizes: ['revel in riches','academy manufactor','marionette master'],          value: 0.22 },
];

// ---------- AUXILIARES ----------
function evaluateManaEfficiency(card) {
  const cmc  = card.cmc || 0;
  const text = (card.oracle_text || '').toLowerCase();
  let s = 0;
  if (cmc <= 2) { s += 10; if (/draw|destroy|exile/.test(text)) s += 6; }
  else if (cmc <= 4) s += 4;
  else if (cmc >= 7) { s -= 5; if (/\ball\b|\beach\b|win the game/.test(text)) s += 8; }
  if (/cost.*less|without paying/.test(text)) s += 8;
  return s;
}

function evaluateCombatKeywords(card) {
  const text = (card.oracle_text || '').toLowerCase();
  const kws  = (card.keywords    || []).map(k => k.toLowerCase());
  const vals = { flying:8, hexproof:15, indestructible:18, haste:10, flash:12, deathtouch:10,
                 trample:7, 'double strike':15, lifelink:8, cascade:20, ward:10, persist:10, undying:12, menace:6 };
  let s = 0;
  for (const [kw, v] of Object.entries(vals)) {
    if (text.includes(kw) || kws.includes(kw)) s += v;
  }
  return Math.min(s, 50);
}

function evaluateVersatility(card) {
  const text = (card.oracle_text || '').toLowerCase();
  let s = 0;
  if (/choose one|choose two|modal/.test(text)) s += 12;
  if (card.card_faces?.length > 1)              s += 8;
  if (/target permanent|any target/.test(text)) s += 8;
  return s;
}

function evaluatePenalties(card) {
  const text = (card.oracle_text || '').toLowerCase();
  let p = 0;
  if (/each (player|opponent) (draws|creates|gains)/.test(text)) p -= 12;
  if (/as an additional cost.*sacrifice a creature/.test(text))  p -= 8;
  if (/enters the battlefield tapped/.test(text))                p -= 5;
  if (/only during combat/.test(text))                           p -= 4;
  return p;
}

function evaluateComboValue(card, availableNorms) {
  const n = normalizeCardName(card.name);
  let total = 0;
  for (const combo of knownCombos) {
    const pn = combo.pieces.map(normalizeCardName);
    const sn = combo.support.map(normalizeCardName);
    const isPiece   = pn.includes(n);
    const isSupport = !isPiece && sn.includes(n);
    if (!isPiece && !isSupport) continue;
    const avail = pn.filter(p => p === n || availableNorms.has(p)).length;
    const ratio = avail / pn.length;
    if (isPiece)   total += combo.value * (ratio >= 1 ? 1.5 : ratio >= 0.5 ? ratio : 0.3);
    if (isSupport) total += combo.value * 0.35;
  }
  return Math.min(total, 80);
}

function evaluateSynergyPackage(card, availableNorms) {
  const n = normalizeCardName(card.name);
  let total = 0;
  for (const pkg of synergyPackages) {
    const cn = pkg.core.map(normalizeCardName);
    const sn = pkg.synergizes.map(normalizeCardName);
    const isCore = cn.includes(n);
    const isSyn  = !isCore && sn.includes(n);
    if (!isCore && !isSyn) continue;
    const cr = cn.filter(c => availableNorms.has(c)).length / cn.length;
    const sr = sn.filter(s => availableNorms.has(s)).length / Math.max(sn.length, 1);
    if (isCore) total += pkg.value * 100 * (0.5 + cr * 0.3 + sr * 0.2);
    else        total += pkg.value * 100 * 0.5 * cr;
  }
  return Math.min(total, 50);
}

function popularityScore(rank) {
  if (!Number.isFinite(rank)) return 0;
  return 1 / Math.log(rank + 10);
}

// ---------- TAGS PARA EL BUILDER ----------
export function getCardTags(card) {
  const tags = [];
  const text = (card.oracle_text || '').toLowerCase();
  const type = (card.type_line   || '').toLowerCase();

  if (type.includes('land')) { tags.push('land'); return tags; }

  if (/\badd \{[WUBRGC]|search your library for.*(basic )?land|create.*(treasure|gold)|\{T\}.*add/i.test(text)
    || (type.includes('creature') && /\{T\}.*add.*mana/i.test(text))) tags.push('ramp');

  if (/draw(s)? (a |one |two |three |\d+ )?card|exile the top.*you may (play|cast)|look at the top.*put.*into your hand/i.test(text))
    tags.push('draw');

  if (/destroy all|exile all|damage to each creature|all creatures get -|sacrifice all/i.test(text))
    tags.push('wipe');
  else if (/destroy target|exile target|return target.*hand|deals \d+ damage to (target|any)/i.test(text))
    tags.push('removal');

  if (/search your library for a(n)?(?!.*(basic land|forest|plains|island|swamp|mountain))/i.test(text))
    tags.push('tutor');

  if (/hexproof|indestructible|protection from|counter target spell/i.test(text))
    tags.push('protection');

  if (/return.*(from|in) your graveyard|reanimate|unearth|escape/i.test(text))
    tags.push('recursion');

  return tags;
}

// ---------- MAP BUILDERS ----------
export function buildCommanderSynergyMap(edhrecCards) {
  const map = new Map();
  if (!Array.isArray(edhrecCards)) return map;
  for (const c of edhrecCards) {
    if (c?.name) map.set(normalizeCardName(c.name), Number(c.synergy) || 0);
  }
  return map;
}

export function buildCooccurrenceMap(edhrecCards) {
  const map = new Map();
  if (!Array.isArray(edhrecCards)) return map;
  let max = 1;
  for (const c of edhrecCards) if (c?.num_decks > max) max = c.num_decks;
  for (const c of edhrecCards) {
    if (c?.name) map.set(normalizeCardName(c.name), (c.num_decks || 0) / max);
  }
  return map;
}

export function computeDeckSynergyMap(candidates, selectedCards) {
  const map = new Map();
  const selMechs = new Set();
  const selTypes = new Set();
  const selColors = new Set();

  for (const sel of selectedCards) {
    const text = (sel.oracle_text || '').toLowerCase();
    for (const { pattern, group } of MECHANIC_GROUPS) {
      if (pattern.test(text)) selMechs.add(group);
    }

    const typeLine = (sel.type_line || '').toLowerCase();
    const subtypes = typeLine.split('—')[1] || '';
    for (const part of subtypes.split(/[,\s]+/)) {
      const clean = part.replace(/[^a-z]/g, '');
      if (clean) selTypes.add(clean);
    }

    for (const color of sel.colors || []) selColors.add(color);
  }

  for (const card of candidates) {
    let syn = 0;
    const text = (card.oracle_text || '').toLowerCase();
    const typeLine = (card.type_line || '').toLowerCase();

    for (const { pattern, group } of MECHANIC_GROUPS) {
      if (selMechs.has(group) && pattern.test(text)) syn += 0.25;
    }
    for (const color of card.colors || []) {
      if (selColors.has(color)) syn += 0.02;
    }
    for (const type of selTypes) {
      if (text.includes(type) || typeLine.includes(type)) syn += 0.12;
    }

    map.set(normalizeCardName(card.name), syn);
  }
  return map;
}

// ---------- SCORE PRINCIPAL ----------
export function computeCardScore({
  card,
  collectionCounts,
  commanderProfile,
  commanderSynergyMap = new Map(),
  deckSynergyMap      = new Map(),
  cooccurrenceMap     = new Map(),
  theme               = 'none',
  availableNorms      = new Set(),
}) {
  const name = normalizeCardName(card.name);
  let score  = 0;

  // 1. Perfil del comandante — señal dominante (peso 120)
  if (commanderProfile) {
    score += computeProfileRelevance(card, commanderProfile, theme) * 120;
  }

  // 2. Colección propia
  if (collectionCounts.has(name)) score += 50;

  // 3. Sinergia EDHREC con el comandante
  score += (commanderSynergyMap.get(name) ?? 0) * 40;

  // 4. Sinergia con el mazo en construcción
  score += (deckSynergyMap.get(name) ?? 0) * 30;

  // 5. Co-ocurrencia
  score += (cooccurrenceMap.get(name) ?? 0) * 20;

  // 6. Popularidad EDHREC (señal débil)
  score += popularityScore(card.edhrec_rank) * 12;

  // 7. Eficiencia de maná
  score += evaluateManaEfficiency(card);

  // 8. Keywords
  score += evaluateCombatKeywords(card) * 0.5;

  // 9. Versatilidad
  score += evaluateVersatility(card) * 0.6;

  // 10. Penalizaciones
  score += evaluatePenalties(card);

  // 11. Combos y paquetes
  if (availableNorms.size > 0) {
    score += evaluateComboValue(card, availableNorms);
    score += evaluateSynergyPackage(card, availableNorms);
  }

  return score;
}

// ---------- SORT ----------
export function sortByScore({ cards, collectionCounts, commanderProfile, commanderSynergyMap, deckSynergyMap, cooccurrenceMap, theme }) {
  const availableNorms = new Set(cards.map(c => normalizeCardName(c.name)));
  return [...cards].sort((a, b) =>
    computeCardScore({ card: b, collectionCounts, commanderProfile, commanderSynergyMap, deckSynergyMap, cooccurrenceMap, theme, availableNorms })
    - computeCardScore({ card: a, collectionCounts, commanderProfile, commanderSynergyMap, deckSynergyMap, cooccurrenceMap, theme, availableNorms })
  );
}

// ---------- SORT ITERATIVO ----------
export function sortByScoreIterative({ cards, collectionCounts, commanderProfile, commanderSynergyMap, cooccurrenceMap, theme, commander, iterations = 3, topN = 150 }) {
  let selected       = commander ? [commander] : [];
  let deckSynergyMap = computeDeckSynergyMap(cards, selected);
  let ordered = sortByScore({ cards, collectionCounts, commanderProfile, commanderSynergyMap, deckSynergyMap, cooccurrenceMap, theme });

  for (let i = 0; i < iterations; i++) {
    selected       = [...(commander ? [commander] : []), ...ordered.slice(0, topN)];
    deckSynergyMap = computeDeckSynergyMap(cards, selected);
    ordered = sortByScore({ cards, collectionCounts, commanderProfile, commanderSynergyMap, deckSynergyMap, cooccurrenceMap, theme });
  }
  return ordered;
}
