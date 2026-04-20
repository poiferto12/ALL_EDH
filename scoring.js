// scoring.js - Sistema de puntuación avanzado para Commander

// ---------- PESOS POR DEFECTO ----------
export const defaultWeights = {
  owned: 50,
  themeMatch: 60,
  commanderSynergy: 40,
  deckSynergy: 25,
  cooccurrence: 20,
  popularity: 15,
  // Nuevos pesos
  intrinsicQuality: 35,
  manaEfficiency: 30,
  cardAdvantage: 25,
  combatKeywords: 15,
  versatility: 20,
  scalability: 15,
  penalties: -40,
  // Pesos para combos y sinergias avanzadas
  comboBonus: 45,
  synergyPackageBonus: 30
};

// ---------- UTIL ----------
export function normalizeCardName(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------- PALABRAS CLAVE DE COMBATE Y SU VALOR ----------
const combatKeywordValues = {
  // Evasión (muy valiosas)
  flying: 8,
  unblockable: 12,
  "can't be blocked": 12,
  shadow: 10,
  horsemanship: 10,
  skulk: 5,
  menace: 6,
  fear: 5,
  intimidate: 5,
  
  // Protección y supervivencia
  hexproof: 15,
  shroud: 12,
  indestructible: 18,
  ward: 10,
  "protection from": 12,
  regenerate: 6,
  persist: 10,
  undying: 12,
  
  // Daño y combate
  deathtouch: 10,
  trample: 7,
  "double strike": 15,
  "first strike": 6,
  lifelink: 8,
  vigilance: 5,
  reach: 3,
  haste: 10,
  
  // Valor adicional
  flash: 12,
  cascade: 20,
  storm: 18,
  convoke: 8,
  affinity: 12,
  delve: 10,
  improvise: 8,
  
  // Multiplicadores de valor
  annihilator: 15,
  infect: 12,
  wither: 6,
  flanking: 4,
  exalted: 6
};

// ---------- EFECTOS DE VALOR (ETB, DEATH, etc.) ----------
const valueEffectPatterns = {
  // Triggers de entrada muy valiosos
  etbDraw: { pattern: /when .* enters.*draw/i, value: 15 },
  etbTutor: { pattern: /when .* enters.*search your library/i, value: 18 },
  etbRemoval: { pattern: /when .* enters.*(destroy|exile) target/i, value: 15 },
  etbTokens: { pattern: /when .* enters.*create.*token/i, value: 12 },
  etbRamp: { pattern: /when .* enters.*(add|search.*land)/i, value: 14 },
  etbCounters: { pattern: /when .* enters.*\+1\/\+1 counter/i, value: 10 },
  
  // Triggers de muerte
  deathDraw: { pattern: /when .* dies.*draw/i, value: 12 },
  deathReturn: { pattern: /when .* dies.*return/i, value: 10 },
  deathTokens: { pattern: /when .* dies.*create.*token/i, value: 12 },
  deathDamage: { pattern: /when .* dies.*damage/i, value: 8 },
  
  // Triggers de ataque/daño
  attackDraw: { pattern: /whenever .* attacks.*draw/i, value: 14 },
  attackTokens: { pattern: /whenever .* attacks.*create.*token/i, value: 12 },
  combatDamage: { pattern: /deals combat damage to a player.*draw/i, value: 15 },
  combatDamageTutor: { pattern: /deals combat damage to a player.*search/i, value: 18 },
  
  // Triggers de turno
  upkeepValue: { pattern: /at the beginning of your upkeep.*(draw|create|add)/i, value: 12 },
  endstepValue: { pattern: /at the beginning of your end step.*(draw|create)/i, value: 10 },
  
  // Habilidades activadas valiosas
  activatedDraw: { pattern: /\{[0-9WUBRGC,{}]+\}.*:.*draw/i, value: 10 },
  activatedTutor: { pattern: /\{[0-9WUBRGC,{}]+\}.*:.*search your library/i, value: 12 },
  activatedRemoval: { pattern: /\{[0-9WUBRGC,{}]+\}.*:.*(destroy|exile) target/i, value: 10 },
  
  // Efectos de multiplicación
  doubling: { pattern: /if.*would.*instead/i, value: 15 },
  copying: { pattern: /copy target (spell|creature|artifact)/i, value: 14 },
  
  // Card advantage directo
  drawMultiple: { pattern: /draw (two|three|four|2|3|4|five|5) cards/i, value: 15 },
  drawOnCast: { pattern: /whenever you cast.*draw/i, value: 14 },
  
  // Ramp eficiente
  landToPlay: { pattern: /search your library for.*(basic land|land card).*onto the battlefield/i, value: 12 },
  manaDoubling: { pattern: /whenever.*tap.*for mana.*add/i, value: 18 },
  treasureGeneration: { pattern: /create.*treasure token/i, value: 8 }
};

// ---------- PENALIZACIONES ----------
const penaltyPatterns = {
  // Cartas muy situacionales
  tooNarrow: { pattern: /target (player|opponent) with.*or more/i, value: -10 },
  specificCounter: { pattern: /counter target (artifact|enchantment|creature) spell/i, value: -5 },
  
  // Costes adicionales negativos
  sacrificeCost: { pattern: /as an additional cost.*sacrifice a creature/i, value: -8 },
  discardCost: { pattern: /as an additional cost.*discard/i, value: -6 },
  lifeCost: { pattern: /pay (half your life|10 life|X life)/i, value: -5 },
  
  // Beneficia a oponentes
  opponentsBenefit: { pattern: /each (player|opponent) (draws|creates|gains)/i, value: -12 },
  symmetrical: { pattern: /each player sacrifices|all creatures get|each player discards/i, value: -5 },
  
  // Restricciones de uso
  oncePerTurn: { pattern: /activate.*only (once each turn|as a sorcery)/i, value: -3 },
  duringCombat: { pattern: /only during combat/i, value: -4 },
  
  // Cartas lentas o ineficientes
  entersTapped: { pattern: /enters the battlefield tapped/i, value: -6 },
  slowTrigger: { pattern: /at the beginning of the next end step/i, value: -4 },
  
  // Anti-sinergia en Commander
  singleOpponent: { pattern: /target opponent(?! controls)/i, value: -3 }, // Menos impacto en multiplayer
  exilesOwn: { pattern: /exile.*cards? from your (graveyard|library)/i, value: -4 }
};

// ---------- TEMAS / ARQUETIPOS (MEJORADOS) ----------
const themePatterns = {
  voltron: {
    core: /\b(equip|enchant creature|aura|attached|equipped creature gets|enchanted creature)/i,
    support: /\b(commander|attack(s|ing) alone|first strike|double strike|hexproof|indestructible|protection from)/i,
    bonus: 1.3
  },
  lifegain: {
    core: /\b(gain(s)? life|lifelink|whenever you gain life|life total|pay life)/i,
    support: /\b(soul warden|ajani|angel|cleric|life.*greater|double.*life)/i,
    bonus: 1.2
  },
  tokens: {
    core: /\b(create(s)?.*token|populate|token(s)? (you control|creature))/i,
    support: /\b(doubling season|parallel lives|anointed procession|convoke|go wide|anthem)/i,
    bonus: 1.25
  },
  aristocrats: {
    core: /\b(sacrifice(s)?|when(ever)?.*dies|blood artist|zulaport|death trigger)/i,
    support: /\b(aristocrat|drain|fodder|afterlife|persist|undying|gravepact)/i,
    bonus: 1.3
  },
  burn: {
    core: /\b(deal(s)?.*damage to (target|each|any)|lightning|bolt|shock)/i,
    support: /\b(ping|guttersnipe|firebrand|goblin|red.*instant|sorcery.*damage)/i,
    bonus: 1.2
  },
  storm: {
    core: /\b(instant(s)? (or|and) sorceries?|copy target spell|storm|magecraft|cast.*instant)/i,
    support: /\b(cost.*less|free.*cast|prowess|spell(slinger)?|cantrip)/i,
    bonus: 1.35
  },
  artifacts: {
    core: /\b(artifact(s)?|treasure|clue|food|historic|metalcraft|affinity)/i,
    support: /\b(improvise|modular|equipment|vehicle|fabricate|proliferate)/i,
    bonus: 1.25
  },
  graveyard: {
    core: /\b(graveyard|mill|reanimate|dredge|escape|flashback|unearth)/i,
    support: /\b(delve|threshold|delirium|self-mill|entomb|buried alive)/i,
    bonus: 1.3
  },
  aggro: {
    core: /\b(haste|attack(s|ing)|combat|+\d\/|battalion|raid)/i,
    support: /\b(menace|trample|first strike|double strike|overwhelm|overrun)/i,
    bonus: 1.2
  },
  control: {
    core: /\b(counter target|destroy all|exile all|board wipe|removal)/i,
    support: /\b(draw.*card|scry|surveil|flash|instant)/i,
    bonus: 1.2
  },
  ramp: {
    core: /\b(add \{|search.*land|mana dork|mana rock)/i,
    support: /\b(ramp|cultivate|kodama|exploration|burgeoning)/i,
    bonus: 1.15
  },
  counters: {
    core: /\b(\+1\/\+1 counter|proliferate|-1\/-1 counter|counter on)/i,
    support: /\b(modular|graft|evolve|mentor|riot|outlast)/i,
    bonus: 1.25
  },
  enchantress: {
    core: /\b(enchantment|aura|constellation|whenever.*enchantment)/i,
    support: /\b(enchantress|shrine|saga|bestow)/i,
    bonus: 1.3
  },
  tribal: {
    core: /\b(creatures? you control (get|have)|creature type|changeling)/i,
    support: /\b(lord|anthem|kindred|tribal)/i,
    bonus: 1.2
  }
};

// ---------- COMBOS CONOCIDOS DE COMMANDER ----------
// Cada combo tiene piezas que se buscan juntas
const knownCombos = [
  // === COMBOS DE MANA INFINITO ===
  {
    name: "Peregrine Drake + Deadeye Navigator",
    pieces: ["peregrine drake", "deadeye navigator"],
    support: ["palinchron", "great whale", "cloud of faeries"],
    description: "Mana infinito con blink",
    value: 30
  },
  {
    name: "Dramatic Reversal + Isochron Scepter",
    pieces: ["dramatic reversal", "isochron scepter"],
    support: ["sol ring", "mana vault", "arcane signet"],
    description: "Mana infinito con 3+ mana de artefactos",
    value: 35
  },
  {
    name: "Basalt Monolith + Rings of Brighthearth",
    pieces: ["basalt monolith", "rings of brighthearth"],
    support: ["power artifact", "kinnan, bonder prodigy"],
    description: "Mana infinito incoloro",
    value: 28
  },
  {
    name: "Dockside + Temur Sabertooth",
    pieces: ["dockside extortionist", "temur sabertooth"],
    support: ["cloudstone curio", "wirewood symbiote"],
    description: "Mana infinito si oponentes tienen artefactos/encantamientos",
    value: 32
  },
  {
    name: "Worldgorger Dragon Combo",
    pieces: ["worldgorger dragon", "animate dead"],
    support: ["dance of the dead", "necromancy"],
    description: "Mana infinito + triggers infinitos",
    value: 30
  },
  
  // === COMBOS DE CRIATURAS INFINITAS ===
  {
    name: "Kiki-Jiki + Zealous Conscripts",
    pieces: ["kiki-jiki, mirror breaker", "zealous conscripts"],
    support: ["splinter twin", "pestermite", "deceiver exarch", "felidar guardian", "restoration angel"],
    description: "Criaturas infinitas con haste",
    value: 35
  },
  {
    name: "Reveillark + Karmic Guide",
    pieces: ["reveillark", "karmic guide"],
    support: ["fiend hunter", "altar of dementia", "viscera seer"],
    description: "Loop infinito de criaturas",
    value: 28
  },
  {
    name: "Nim Deathmantle + Ashnod's Altar",
    pieces: ["nim deathmantle", "ashnod's altar"],
    support: ["grave titan", "wurmcoil engine", "breya, etherium shaper"],
    description: "Tokens infinitos con generadores de tokens",
    value: 25
  },
  
  // === COMBOS DE DAMAGE/DRAIN INFINITO ===
  {
    name: "Niv-Mizzet + Curiosity",
    pieces: ["niv-mizzet, parun", "curiosity"],
    support: ["niv-mizzet, the firemind", "ophidian eye", "tandem lookout"],
    description: "Damage infinito = draw infinito",
    value: 30
  },
  {
    name: "Exquisite Blood + Sanguine Bond",
    pieces: ["exquisite blood", "sanguine bond"],
    support: ["vito, thorn of the dusk rose", "defiant bloodlord"],
    description: "Drain infinito de vida",
    value: 28
  },
  {
    name: "Mikaeus + Triskelion",
    pieces: ["mikaeus, the unhallowed", "triskelion"],
    support: ["walking ballista", "murderous redcap"],
    description: "Damage infinito a todos los oponentes",
    value: 32
  },
  {
    name: "Heliod + Walking Ballista",
    pieces: ["heliod, sun-crowned", "walking ballista"],
    support: ["triskelion", "spike feeder"],
    description: "Damage infinito con lifelink",
    value: 30
  },
  
  // === COMBOS DE MILL/DRAW INFINITO ===
  {
    name: "Thassa's Oracle + Demonic Consultation",
    pieces: ["thassa's oracle", "demonic consultation"],
    support: ["tainted pact", "jace, wielder of mysteries", "laboratory maniac"],
    description: "Win condition instantanea",
    value: 40
  },
  {
    name: "Painter's Servant + Grindstone",
    pieces: ["painter's servant", "grindstone"],
    support: [],
    description: "Mill completo de un oponente",
    value: 28
  },
  
  // === COMBOS DE TURNOS INFINITOS ===
  {
    name: "Time Warp + Archaeomancer",
    pieces: ["time warp", "archaeomancer"],
    support: ["temporal manipulation", "capture of jingzhou", "ghostly flicker", "displace"],
    description: "Turnos infinitos con blink",
    value: 30
  },
  
  // === COMBOS DE SACRIFICE ===
  {
    name: "Aristocrats Engine",
    pieces: ["blood artist", "viscera seer"],
    support: ["zulaport cutthroat", "cruel celebrant", "bastion of remembrance", "carrion feeder", "yahenni, undying partisan"],
    description: "Drain con cada muerte",
    value: 22
  },
  {
    name: "Gravecrawler + Phyrexian Altar",
    pieces: ["gravecrawler", "phyrexian altar"],
    support: ["pitiless plunderer", "blood artist", "zulaport cutthroat"],
    description: "Mana infinito y triggers de muerte infinitos",
    value: 30
  },
  
  // === COMBOS DE LANDS ===
  {
    name: "Kodama + Bounce Land",
    pieces: ["kodama of the east tree", "simic growth chamber"],
    support: ["guildless commons", "oboro, palace in the clouds", "tireless provisioner"],
    description: "Landfall infinito",
    value: 25
  },
  
  // === COMBOS DE ARTIFACTS ===
  {
    name: "Time Sieve + Thopter Assembly",
    pieces: ["time sieve", "thopter assembly"],
    support: ["thopter foundry", "sword of the meek"],
    description: "Turnos infinitos con artefactos",
    value: 28
  },
  {
    name: "Sword of the Meek + Thopter Foundry",
    pieces: ["sword of the meek", "thopter foundry"],
    support: ["krark-clan ironworks", "ashnod's altar"],
    description: "Thopters y vida infinitos",
    value: 26
  },
  
  // === COMBOS DE COUNTERS ===
  {
    name: "Devoted Druid + Vizier of Remedies",
    pieces: ["devoted druid", "vizier of remedies"],
    support: ["swift reconfiguration", "luxior, giada's gift"],
    description: "Mana verde infinito",
    value: 28
  },
  {
    name: "Spike Feeder + Archangel of Thune",
    pieces: ["spike feeder", "archangel of thune"],
    support: ["heliod, sun-crowned", "good-fortune unicorn"],
    description: "Vida y contadores infinitos",
    value: 26
  }
];

// ---------- PAQUETES DE SINERGIA ----------
// Grupos de cartas que funcionan muy bien juntas aunque no sean combos infinitos
const synergyPackages = [
  // Paquete de Blink/ETB
  {
    name: "Blink Package",
    core: ["conjurer's closet", "brago, king eternal", "panharmonicon", "thassa, deep-dwelling"],
    synergizes: ["mulldrifter", "cloudblazer", "ravenous chupacabra", "eternal witness", "archaeomancer", "agent of treachery"],
    theme: "etb-value",
    value: 0.20
  },
  // Paquete de Tokens
  {
    name: "Token Doublers",
    core: ["doubling season", "parallel lives", "anointed procession", "primal vigor"],
    synergizes: ["avenger of zendikar", "tendershoot dryad", "army of the damned", "secure the wastes", "white sun's zenith"],
    theme: "tokens",
    value: 0.22
  },
  // Paquete de Sacrifice
  {
    name: "Sacrifice Outlets + Payoffs",
    core: ["viscera seer", "carrion feeder", "ashnod's altar", "phyrexian altar", "altar of dementia"],
    synergizes: ["grave pact", "dictate of erebos", "butcher of malakir", "blood artist", "zulaport cutthroat"],
    theme: "aristocrats",
    value: 0.22
  },
  // Paquete de Reanimator
  {
    name: "Reanimator Package",
    core: ["reanimate", "animate dead", "necromancy", "karmic guide"],
    synergizes: ["entomb", "buried alive", "faithless looting", "cathartic reunion", "vilis, broker of blood", "razaketh, the foulblooded"],
    theme: "graveyard",
    value: 0.20
  },
  // Paquete de Storm
  {
    name: "Storm Package",
    core: ["thousand-year storm", "storm-kiln artist", "birgi, god of storytelling"],
    synergizes: ["grapeshot", "brain freeze", "tendrils of agony", "aetherflux reservoir", "guttersnipe"],
    theme: "storm",
    value: 0.22
  },
  // Paquete de Wheels
  {
    name: "Wheels Package",
    core: ["wheel of fortune", "windfall", "whispering madness"],
    synergizes: ["notion thief", "narset, parter of veils", "smothering tithe", "waste not", "teferi's puzzle box"],
    theme: "card-advantage",
    value: 0.20
  },
  // Paquete de Enchantress
  {
    name: "Enchantress Package",
    core: ["enchantress's presence", "argothian enchantress", "mesa enchantress", "verduran enchantress"],
    synergizes: ["sigil of the empty throne", "sphere of safety", "ancestral mask", "ethereal armor"],
    theme: "enchantress",
    value: 0.20
  },
  // Paquete de Counters
  {
    name: "+1/+1 Counter Package",
    core: ["hardened scales", "doubling season", "branching evolution", "ozolith, the shattered spire"],
    synergizes: ["walking ballista", "hangarback walker", "champion of lambholt", "kalonian hydra", "master biomancer"],
    theme: "counters",
    value: 0.20
  },
  // Paquete de Equipment/Voltron
  {
    name: "Equipment Package",
    core: ["stoneforge mystic", "puresteel paladin", "sram, senior edificer", "sigarda's aid"],
    synergizes: ["sword of feast and famine", "sword of fire and ice", "umezawa's jitte", "batterskull", "kaldra compleat"],
    theme: "voltron",
    value: 0.20
  },
  // Paquete de Treasures
  {
    name: "Treasure Package",
    core: ["smothering tithe", "dockside extortionist", "professional face-breaker", "goldspan dragon"],
    synergizes: ["revel in riches", "academy manufactor", "marionette master", "disciple of the vault", "mechanized production"],
    theme: "artifacts",
    value: 0.22
  }
];

// ---------- SINERGIAS ENTRE CARTAS (MEJORADO) ----------
const keywordSynergies = [
  // Tokens
  { keys: ["token", "create", "populate"], groups: ["tokens", "go-wide"], value: 0.15 },
  { keys: ["sacrifice", "aristocrat", "dies"], groups: ["aristocrats", "value"], value: 0.18 },
  
  // Card draw
  { keys: ["draw", "wheel", "loot"], groups: ["card-advantage"], value: 0.12 },
  { keys: ["discard", "madness", "draw"], groups: ["graveyard", "value"], value: 0.14 },
  
  // Lifegain
  { keys: ["gain life", "lifelink", "whenever you gain life", "life total"], groups: ["lifegain"], value: 0.16 },
  
  // Counters
  { keys: ["+1/+1 counter", "proliferate", "modular", "graft"], groups: ["counters"], value: 0.18 },
  { keys: ["-1/-1 counter", "wither", "infect"], groups: ["counters-negative"], value: 0.15 },
  
  // Graveyard
  { keys: ["graveyard", "return from", "mill", "reanimate", "dredge"], groups: ["graveyard"], value: 0.16 },
  { keys: ["flashback", "escape", "unearth", "aftermath"], groups: ["graveyard-cast"], value: 0.14 },
  
  // Artifacts
  { keys: ["artifact", "treasure", "clue", "food", "gold"], groups: ["artifacts"], value: 0.12 },
  { keys: ["equipment", "equip", "equipped creature"], groups: ["voltron", "artifacts"], value: 0.15 },
  
  // Spellslinger
  { keys: ["instant", "sorcery", "magecraft", "prowess"], groups: ["spells"], value: 0.14 },
  { keys: ["copy", "fork", "storm"], groups: ["spells-combo"], value: 0.18 },
  
  // Combat
  { keys: ["attack", "combat", "combat damage", "battalion"], groups: ["aggro"], value: 0.12 },
  { keys: ["double strike", "extra combat", "additional combat"], groups: ["combat-combo"], value: 0.20 },
  
  // Enchantments
  { keys: ["enchantment", "aura", "constellation"], groups: ["enchantress"], value: 0.15 },
  
  // ETB/Blink
  { keys: ["enters the battlefield", "etb", "flicker", "blink"], groups: ["etb-value"], value: 0.18 },
  
  // Lands matter
  { keys: ["landfall", "land enters", "play additional land"], groups: ["lands"], value: 0.16 },
  
  // Untap synergies (para combos)
  { keys: ["untap", "doesn't untap", "tap target"], groups: ["untap-matters"], value: 0.12 },
  
  // Tutores y busqueda
  { keys: ["search your library", "tutor"], groups: ["tutor"], value: 0.10 },
  
  // Copying
  { keys: ["copy", "token that's a copy", "create a copy"], groups: ["copy-matters"], value: 0.16 }
];

// ---------- CARTAS STAPLES CONOCIDAS ----------
// Cartas que son universalmente buenas y deberían tener bonus
const universalStaples = new Set([
  "sol ring", "arcane signet", "command tower", "lightning greaves",
  "swiftfoot boots", "swords to plowshares", "path to exile",
  "counterspell", "cyclonic rift", "demonic tutor", "vampiric tutor",
  "rhystic study", "smothering tithe", "dockside extortionist",
  "fierce guardianship", "deflecting swat", "deadly rollick",
  "jeska's will", "esper sentinel", "ragavan, nimble pilferer",
  "mana crypt", "mana vault", "chrome mox", "mox diamond",
  "sylvan library", "necropotence", "ad nauseam",
  "cultivate", "kodama's reach", "farseek", "nature's lore",
  "beast within", "chaos warp", "generous gift", "anguished unmaking",
  "toxic deluge", "blasphemous act", "vandalblast", "farewell"
]);

// Tierras que siempre son buenas
const goodLands = new Set([
  "command tower", "exotic orchard", "mana confluence", "city of brass",
  "reflecting pool", "ancient tomb", "strip mine", "wasteland",
  "urborg, tomb of yawgmoth", "cabal coffers", "nykthos, shrine to nyx",
  "gaea's cradle", "fetch land", "shock land", "dual land"
]);

// ---------- FUNCIONES DE EVALUACIÓN ----------

// Evalúa la eficiencia de maná de la carta
function evaluateManaEfficiency(card) {
  const cmc = card.cmc || 0;
  const text = (card.oracle_text || "").toLowerCase();
  const typeLine = (card.type_line || "").toLowerCase();
  
  let score = 0;
  
  // Cartas de bajo coste con alto impacto son más eficientes
  if (cmc <= 2) {
    score += 10;
    // Bonus extra si hace algo significativo a bajo coste
    if (text.includes("draw") || text.includes("destroy") || text.includes("exile")) {
      score += 8;
    }
  } else if (cmc <= 4) {
    score += 5;
  } else if (cmc >= 7) {
    // Cartas caras necesitan justificar su coste
    score -= 5;
    // Pero si tienen efectos masivos, se lo perdonamos
    if (text.includes("all") || text.includes("each") || text.includes("win the game")) {
      score += 10;
    }
  }
  
  // Reducción de coste es muy valiosa
  if (text.includes("cost") && (text.includes("less") || text.includes("reduced"))) {
    score += 8;
  }
  
  // Costes alternativos
  if (text.includes("without paying") || text.includes("for free")) {
    score += 12;
  }
  
  // Cartas con X son flexibles
  if (text.includes("{x}") && cmc <= 1) {
    score += 6;
  }
  
  return score;
}

// Evalúa palabras clave de combate
function evaluateCombatKeywords(card) {
  const text = (card.oracle_text || "").toLowerCase();
  const keywords = (card.keywords || []).map(k => k.toLowerCase());
  
  let score = 0;
  
  for (const [keyword, value] of Object.entries(combatKeywordValues)) {
    if (text.includes(keyword) || keywords.some(k => k.includes(keyword))) {
      score += value;
    }
  }
  
  // Bonus por múltiples palabras clave
  const keywordCount = Object.keys(combatKeywordValues).filter(
    k => text.includes(k) || keywords.includes(k)
  ).length;
  
  if (keywordCount >= 3) {
    score += 10; // Carta muy versátil en combate
  }
  
  return Math.min(score, 50); // Cap para no desbalancear
}

// Evalúa efectos de valor
function evaluateValueEffects(card) {
  const text = (card.oracle_text || "").toLowerCase();
  let score = 0;
  
  for (const [, effect] of Object.entries(valueEffectPatterns)) {
    if (effect.pattern.test(text)) {
      score += effect.value;
    }
  }
  
  return Math.min(score, 60); // Cap para balance
}

// Evalúa penalizaciones
function evaluatePenalties(card) {
  const text = (card.oracle_text || "").toLowerCase();
  let penalty = 0;
  
  for (const [, penaltyInfo] of Object.entries(penaltyPatterns)) {
    if (penaltyInfo.pattern.test(text)) {
      penalty += penaltyInfo.value;
    }
  }
  
  return penalty; // Ya es negativo
}

// Evalúa si es una staple universal
function evaluateStapleBonus(card) {
  const name = card.name.toLowerCase();
  const text = (card.oracle_text || "").toLowerCase();
  
  if (universalStaples.has(name)) {
    return 25;
  }
  
  // Verifica si es una tierra buena conocida
  const typeLine = (card.type_line || "").toLowerCase();
  if (typeLine.includes("land")) {
    for (const goodLand of goodLands) {
      if (name.includes(goodLand)) {
        return 15;
      }
    }
    // Fetch lands, shock lands, etc.
    if (name.includes("fetch") || (text.includes("search your library for") && typeLine.includes("land"))) {
      return 12;
    }
  }
  
  return 0;
}

// Evalúa versatilidad de la carta
function evaluateVersatility(card) {
  const text = (card.oracle_text || "").toLowerCase();
  const typeLine = (card.type_line || "").toLowerCase();
  
  let score = 0;
  
  // Modos múltiples
  if (text.includes("choose one") || text.includes("choose two") || text.includes("modal")) {
    score += 12;
  }
  
  // MDFCs (Modal Double-Faced Cards)
  if (card.card_faces && card.card_faces.length > 1) {
    score += 8;
  }
  
  // Cartas con múltiples tipos
  const types = typeLine.split(" ");
  const significantTypes = types.filter(t => 
    ["creature", "artifact", "enchantment", "planeswalker", "instant", "sorcery"].includes(t)
  );
  if (significantTypes.length >= 2) {
    score += 6;
  }
  
  // Habilidades activadas múltiples
  const activatedAbilities = (text.match(/\{[^}]+\}.*:/g) || []).length;
  if (activatedAbilities >= 2) {
    score += 5;
  }
  
  // Puede apuntar a múltiples tipos de permanentes
  if (text.includes("target permanent") || text.includes("any target")) {
    score += 8;
  }
  
  return score;
}

// Evalúa escalabilidad en Commander (multiplayer)
function evaluateScalability(card) {
  const text = (card.oracle_text || "").toLowerCase();
  
  let score = 0;
  
  // Efectos que escalan con múltiples oponentes
  if (text.includes("each opponent") || text.includes("each player")) {
    score += 10;
  }
  
  // Efectos que escalan con número de criaturas/permanentes
  if (text.includes("for each") && (text.includes("creature") || text.includes("permanent"))) {
    score += 8;
  }
  
  // Cartas que se benefician de más jugadores
  if (text.includes("equal to the number of") || text.includes("target player")) {
    score += 5;
  }
  
  // Efectos políticos
  if (text.includes("each player may") || text.includes("vote") || text.includes("council")) {
    score += 6;
  }
  
  return score;
}

// ---------- EXTRACCIÓN DE TAGS (MEJORADO) ----------
export function getCardTags(card) {
  const tags = [];
  const text = (card.oracle_text || "").toLowerCase();
  const type = (card.type_line || "").toLowerCase();

  // Tierras
  if (type.includes("land")) {
    tags.push("land");
    // Sub-categorizar tierras
    if (text.includes("add") && !text.includes("enters the battlefield tapped")) {
      tags.push("land-untapped");
    }
    if (text.includes("search your library")) {
      tags.push("land-fetch");
    }
    return tags;
  }

  // Ramp (mejorado)
  const isRamp = 
    text.match(/\badd \{[WUBRGC]/i) ||
    text.match(/search your library for.*(basic )?land/i) ||
    text.match(/create.*(treasure|gold)/i) ||
    text.match(/\{T\}: Add/i) ||
    (type.includes("creature") && text.match(/\{T\}.*add.*mana/i));
  
  if (isRamp) {
    tags.push("ramp");
    // Ramp eficiente (pone en campo)
    if (text.includes("onto the battlefield")) {
      tags.push("ramp-efficient");
    }
  }

  // Draw (mejorado)
  const isDraw = 
    text.match(/draw(s)? (a |one |two |three |\d+ )?card/i) ||
    text.match(/exile the top.*you may (play|cast)/i) ||
    text.match(/look at the top.*put.*into your hand/i) ||
    text.match(/reveal.*put.*into your hand/i);
  
  if (isDraw) {
    tags.push("draw");
    // Card advantage masivo
    if (text.match(/draw (two|three|four|2|3|4|five|5|\d{2,}) cards/i)) {
      tags.push("draw-mass");
    }
  }

  // Wipe
  if (text.match(/destroy all|exile all|damage to each creature|all creatures get -|sacrifice all|return all.*to/i)) {
    tags.push("wipe");
    // Wipe asimétrico (mejor)
    if (text.includes("you control") && (text.includes("opponents") || text.includes("don't"))) {
      tags.push("wipe-asymmetric");
    }
  }
  // Removal puntual
  else if (text.match(/destroy target|exile target|return target.*hand|deals \d+ damage to (target|any)/i)) {
    tags.push("removal");
    // Removal versátil
    if (text.includes("permanent") || text.includes("any target")) {
      tags.push("removal-flexible");
    }
    // Exilio es mejor que destrucción
    if (text.includes("exile target")) {
      tags.push("removal-exile");
    }
  }

  // Tutores (mejorado)
  if (text.match(/search your library for a(n)?(?!.*(basic land|forest|plains|island|swamp|mountain))/i)) {
    tags.push("tutor");
    // Tutores al campo son mejores
    if (text.includes("onto the battlefield")) {
      tags.push("tutor-battlefield");
    }
    // Tutores a la mano sin reveal son mejores
    if (text.includes("into your hand") && !text.includes("reveal")) {
      tags.push("tutor-hidden");
    }
  }

  // Protección
  if (text.match(/hexproof|indestructible|protection from|counter target spell|prevent (all |the next )?(damage|combat)/i)) {
    tags.push("protection");
    // Counters son protección premium
    if (text.includes("counter target spell")) {
      tags.push("protection-counter");
    }
  }

  // Recursión
  if (text.match(/return.*(from|in) your graveyard|reanimate|unearth|escape/i)) {
    tags.push("recursion");
    // Recursión al campo es mejor
    if (text.includes("to the battlefield")) {
      tags.push("recursion-battlefield");
    }
  }

  // Nuevas categorías
  
  // Finishers
  if (text.match(/you win the game|infinite|extra turn|each opponent loses/i) ||
      (card.power && parseInt(card.power) >= 6 && text.includes("trample"))) {
    tags.push("finisher");
  }
  
  // Enablers de combo
  if (text.match(/untap all|infinite|whenever.*add|free spell/i)) {
    tags.push("combo-piece");
  }

  return tags;
}

// ---------- MAP BUILDERS ----------

export function buildCommanderSynergyMap(edhrecCards) {
  const map = new Map();

  if (!Array.isArray(edhrecCards)) {
    return map;
  }

  for (const card of edhrecCards) {
    if (!card?.name) continue;
    map.set(normalizeCardName(card.name), Number(card.synergy) || 0);
  }
  return map;
}

export function buildCooccurrenceMap(edhrecCards) {
  const map = new Map();

  if (!Array.isArray(edhrecCards)) {
    return map;
  }

  let maxDecks = 1;
  for (const card of edhrecCards) {
    if (card?.num_decks > maxDecks) {
      maxDecks = card.num_decks;
    }
  }

  for (const card of edhrecCards) {
    if (!card?.name) continue;
    const normalized = (card.num_decks || 0) / maxDecks;
    map.set(normalizeCardName(card.name), normalized);
  }

  return map;
}

// ---------- SINERGIA ENTRE CARTAS (MEJORADO) ----------
export function computeDeckSynergyMap(candidates, selectedCards) {
  const map = new Map();
  
  // Pre-computar los grupos de mecánicas de las cartas seleccionadas
  const selectedMechanics = new Set();
  for (const selected of selectedCards) {
    const selectedText = (selected.oracle_text || "").toLowerCase();
    for (const synergy of keywordSynergies) {
      if (synergy.keys.some(k => selectedText.includes(k))) {
        synergy.groups.forEach(g => selectedMechanics.add(g));
      }
    }
  }

  for (const card of candidates) {
    let synergy = 0;
    const cardText = (card.oracle_text || "").toLowerCase();

    for (const selected of selectedCards) {
      // Sinergia por tipos compartidos
      if (card.type_line === selected.type_line) {
        synergy += 0.05;
      }

      // Sinergia por colores compartidos
      const cardColors = new Set(card.colors || []);
      const selectedColors = new Set(selected.colors || []);
      const sharedColors = [...cardColors].filter(c => selectedColors.has(c));
      synergy += sharedColors.length * 0.02;
    }

    // Sinergia por mecánicas
    for (const synergyDef of keywordSynergies) {
      const cardMatch = synergyDef.keys.some(k => cardText.includes(k));
      if (cardMatch) {
        // Verifica si algún grupo coincide con las cartas seleccionadas
        if (synergyDef.groups.some(g => selectedMechanics.has(g))) {
          synergy += synergyDef.value;
        }
      }
    }

    map.set(normalizeCardName(card.name), synergy);
  }
  return map;
}

// ---------- POPULARIDAD ----------
function computePopularityScore(rank) {
  if (!Number.isFinite(rank)) {
    return 0;
  }
  // Curva logaritmica para dar mas peso a cartas muy populares
  return 1 / Math.log(rank + 10);
}

// ---------- EVALUACION DE COMBOS ----------
// Evalua si una carta es parte de un combo conocido y si otras piezas estan disponibles
export function evaluateComboValue(card, allCandidates, selectedCards = []) {
  const cardName = card.name.toLowerCase();
  let totalComboScore = 0;
  
  // Crear un set de nombres de cartas disponibles para busqueda rapida
  const availableCards = new Set();
  for (const c of allCandidates) {
    availableCards.add(c.name.toLowerCase());
  }
  for (const c of selectedCards) {
    availableCards.add(c.name.toLowerCase());
  }
  
  for (const combo of knownCombos) {
    // Verificar si esta carta es parte del combo
    const isPiece = combo.pieces.some(p => cardName.includes(p) || p.includes(cardName));
    const isSupport = combo.support.some(s => cardName.includes(s) || s.includes(cardName));
    
    if (!isPiece && !isSupport) continue;
    
    // Contar cuantas otras piezas del combo estan disponibles
    let availablePieces = 0;
    let totalPieces = combo.pieces.length;
    
    for (const piece of combo.pieces) {
      if (cardName.includes(piece) || piece.includes(cardName)) {
        availablePieces++; // Esta carta cuenta
      } else if ([...availableCards].some(ac => ac.includes(piece) || piece.includes(ac))) {
        availablePieces++;
      }
    }
    
    // Calcular bonus basado en completitud del combo
    if (isPiece) {
      // Si es pieza principal, el valor depende de cuantas otras piezas hay
      const completionRatio = availablePieces / totalPieces;
      if (completionRatio >= 1) {
        // Combo completo disponible - maximo valor
        totalComboScore += combo.value * 1.5;
      } else if (completionRatio >= 0.5) {
        // Al menos la mitad de las piezas
        totalComboScore += combo.value * completionRatio;
      } else {
        // Pocas piezas - valor reducido pero aun positivo
        totalComboScore += combo.value * 0.3;
      }
    } else if (isSupport) {
      // Cartas de soporte valen menos pero aun suman
      totalComboScore += combo.value * 0.4;
    }
  }
  
  return Math.min(totalComboScore, 80); // Cap para no desbalancear demasiado
}

// ---------- EVALUACION DE PAQUETES DE SINERGIA ----------
// Evalua si una carta pertenece a un paquete de cartas que funcionan bien juntas
export function evaluateSynergyPackage(card, allCandidates, theme = "none") {
  const cardName = card.name.toLowerCase();
  let totalPackageScore = 0;
  
  // Crear set de cartas disponibles
  const availableCards = new Set();
  for (const c of allCandidates) {
    availableCards.add(c.name.toLowerCase());
  }
  
  for (const pkg of synergyPackages) {
    // Verificar si esta carta es core o sinergiza con el paquete
    const isCore = pkg.core.some(c => cardName.includes(c) || c.includes(cardName));
    const synergizes = pkg.synergizes.some(s => cardName.includes(s) || s.includes(cardName));
    
    if (!isCore && !synergizes) continue;
    
    // Bonus extra si el tema coincide con el paquete
    const themeBonus = (theme !== "none" && pkg.theme && pkg.theme.includes(theme)) ? 1.3 : 1.0;
    
    // Contar cuantas cartas core del paquete estan disponibles
    let availableCore = 0;
    for (const corePiece of pkg.core) {
      if ([...availableCards].some(ac => ac.includes(corePiece) || corePiece.includes(ac))) {
        availableCore++;
      }
    }
    
    // Contar cuantas cartas que sinergizan estan disponibles
    let availableSynergy = 0;
    for (const synPiece of pkg.synergizes) {
      if ([...availableCards].some(ac => ac.includes(synPiece) || synPiece.includes(ac))) {
        availableSynergy++;
      }
    }
    
    // Calcular valor
    if (isCore) {
      // Cartas core valen mas
      const coreRatio = Math.min(availableCore / pkg.core.length, 1);
      const synRatio = Math.min(availableSynergy / Math.max(pkg.synergizes.length, 1), 1);
      totalPackageScore += pkg.value * 100 * (0.5 + coreRatio * 0.3 + synRatio * 0.2) * themeBonus;
    } else if (synergizes) {
      // Cartas que sinergizan valen menos pero igual suman
      const coreRatio = Math.min(availableCore / pkg.core.length, 1);
      totalPackageScore += pkg.value * 100 * 0.5 * coreRatio * themeBonus;
    }
  }
  
  return Math.min(totalPackageScore, 50); // Cap
}

// ---------- SCORE PRINCIPAL (MEJORADO) ----------
export function computeCardScore({
  card, 
  collectionCounts, 
  commanderSynergyMap, 
  deckSynergyMap, 
  cooccurrenceMap, 
  theme, 
  allCandidates = [],
  selectedCards = [],
  weights = defaultWeights
}) {
  const name = normalizeCardName(card.name);
  let score = 0;

  // 1. Bonus por tenerla en coleccion
  if (collectionCounts.has(name)) {
    score += weights.owned;
  }

  // 2. Sinergia con el tema/arquetipo (MEJORADO)
  if (theme && theme !== "none" && themePatterns[theme]) {
    const text = (card.oracle_text || "").toLowerCase();
    const typeLine = (card.type_line || "").toLowerCase();
    const themeConfig = themePatterns[theme];
    
    // Core match = bonus completo
    if (themeConfig.core.test(text) || themeConfig.core.test(typeLine)) {
      score += weights.themeMatch * themeConfig.bonus;
    }
    // Support match = bonus parcial
    else if (themeConfig.support && (themeConfig.support.test(text) || themeConfig.support.test(typeLine))) {
      score += weights.themeMatch * 0.5;
    }
  }

  // 3. Sinergia con comandante (de EDHREC)
  const commanderSynergy = commanderSynergyMap.get(name) ?? 0;
  score += commanderSynergy * weights.commanderSynergy;

  // 4. Sinergia con el resto del mazo
  const deckSynergy = deckSynergyMap.get(name) ?? 0;
  score += deckSynergy * weights.deckSynergy;

  // 5. Co-ocurrencia
  const cooccurrence = cooccurrenceMap.get(name) ?? 0;
  score += cooccurrence * weights.cooccurrence;

  // 6. Popularidad
  const popularity = computePopularityScore(card.edhrec_rank);
  score += popularity * weights.popularity;

  // --- NUEVAS EVALUACIONES ---

  // 7. Calidad intrinseca (staples)
  const stapleBonus = evaluateStapleBonus(card);
  score += stapleBonus * (weights.intrinsicQuality / 35);

  // 8. Eficiencia de mana
  const manaEfficiency = evaluateManaEfficiency(card);
  score += manaEfficiency * (weights.manaEfficiency / 30);

  // 9. Card advantage y value
  const valueScore = evaluateValueEffects(card);
  score += valueScore * (weights.cardAdvantage / 25);

  // 10. Palabras clave de combate
  const combatScore = evaluateCombatKeywords(card);
  score += combatScore * (weights.combatKeywords / 15);

  // 11. Versatilidad
  const versatilityScore = evaluateVersatility(card);
  score += versatilityScore * (weights.versatility / 20);

  // 12. Escalabilidad en multiplayer
  const scalabilityScore = evaluateScalability(card);
  score += scalabilityScore * (weights.scalability / 15);

  // 13. Penalizaciones
  const penaltyScore = evaluatePenalties(card);
  score += penaltyScore * Math.abs(weights.penalties / 40);

  // 14. Bonus por ser parte de un combo conocido
  if (allCandidates.length > 0) {
    const comboScore = evaluateComboValue(card, allCandidates, selectedCards);
    score += comboScore * (weights.comboBonus / 45);
  }

  // 15. Bonus por pertenecer a un paquete de sinergia
  if (allCandidates.length > 0) {
    const packageScore = evaluateSynergyPackage(card, allCandidates, theme);
    score += packageScore * (weights.synergyPackageBonus / 30);
  }

  return score;
}

// ---------- ORDENACION ----------
export function sortByScore({
  cards,
  collectionCounts,
  commanderSynergyMap,
  deckSynergyMap,
  cooccurrenceMap,
  theme,
  selectedCards = [],
  weights = defaultWeights
}) {
  // Pasamos todas las cartas candidatas para evaluar combos y paquetes
  const allCandidates = cards;
  
  return [...cards].sort((a, b) => {
    const scoreA = computeCardScore({
      card: a,
      collectionCounts,
      commanderSynergyMap,
      deckSynergyMap,
      cooccurrenceMap,
      theme,
      allCandidates,
      selectedCards,
      weights
    });

    const scoreB = computeCardScore({
      card: b,
      collectionCounts,
      commanderSynergyMap,
      deckSynergyMap,
      cooccurrenceMap,
      theme,
      allCandidates,
      selectedCards,
      weights
    });

    return scoreB - scoreA;
  });
}
