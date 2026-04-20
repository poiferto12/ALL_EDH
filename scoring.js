// scoring.js

// ---------- DEFAULT ----------

export const defaultWeights = {
owned: 50,
themeMatch: 60,  // Gran bonificación extra por encajar con el Arquetipo
commanderSynergy: 40,
deckSynergy: 25,
cooccurrence: 20,
popularity: 15
};

// ---------- THEMES / ARQUETIPOS ----------
// Expresiones regulares que buscan mecánicas específicas para potenciar arquetipos
const themePatterns = {
  voltron: /\b(equip|enchant creature|aura|attached|commander gets|commander has)\b/,
  lifegain: /\b(gain life|lifelink|whenever you gain life|life total|pay life)\b/,
  tokens: /\b(create.*token|populate|doubling season|token creatures)\b/,
  aristocrats: /\b(sacrifice|when.*dies|whenever another creature dies|dies, target player loses)\b/,
  burn: /\b(damage to target|damage to each|deals damage|deals.*damage to any target)\b/,
  storm: /\b(instant or sorcery|copy target spell|storm|magecraft|cast an instant)\b/,
  artifacts: /\b(artifact|treasure|clue|food|historic|metalcraft|affinity for artifacts)\b/,
  graveyard: /\b(return target.*from your graveyard|mill|reanimate|dredge|escape|flashback)\b/,
  aggro: /\b(haste|trample|menace|combat phase|attacking creatures|creatures you control get \+)\b/
};

// ---------- UTIL ----------

export function normalizeCardName(name) {
  // Eliminar todo lo que no sea letras o números para igualar nombres de Scryfall y EDHREC (ej: comas, apóstrofes, guiones)
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Extraer tags (Ramp, Draw, Removal, Wipe, Land) de una carta
export function getCardTags(card) {
  const tags = [];
  const text = (card.oracle_text || "").toLowerCase();
  const type = (card.type_line || "").toLowerCase();

  // Tierras (Ignorando las MDFC si la cara frontal no es tierra)
  if (type.includes("land") && !type.includes("nonland")) {
    tags.push("land");
    return tags; // Las tierras son su propio universo, paramos acá.
  }

  // Ramp
  if (
    text.match(/\b(add \{|search your library for a.*land|create.*treasure)\b/) ||
    text.match(/\b(enchant land).*(produce).*(mana)\b/)
  ) {
    tags.push("ramp");
  }

  // Draw (Robo y exilio para jugar)
  if (
    (text.match(/\b(draw(s)? \w* ?card|exile the top.*play|look at the top.*put.*into your hand)\b/) && !text.includes("return target"))
  ) {
    tags.push("draw");
  }

  // Wipe (Limpiamesas)
  if (text.match(/\b(destroy all|exile all|damage to each creature|all creatures get -|put all creatures on the bottom)\b/)) {
    tags.push("wipe");
  }
  // Removal (Destruir permanent/creature localmente, rebotar)
  else if (text.match(/\b(destroy target|exile target|return target.*hand|deals damage to target)\b/)) {
    tags.push("removal");
  }

  // Tutores
  if (text.match(/\b(search your library for a(n)?(?!.*basic land)|search your library and put)\b/)) {
    tags.push("tutor");
  }

  // Protección / Counterspells
  if (text.match(/\b(hexproof|indestructible|protection from|counter target spell|prevent all combat damage)\b/)) {
    tags.push("protection");
  }

  // Recursión
  if (text.match(/\b(return target.*from your graveyard|return.*from your graveyard to the battlefield|return up to.*from your graveyard)\b/)) {
    tags.push("recursion");
  }

  return tags;
}

// ---------- MAP BUILDERS ----------

// Construye mapa de sinergia con comandante
export function buildCommanderSynergyMap(edhrecCards) {
    const map = new Map();

    if (!Array.isArray(edhrecCards)) {
        return map;
    }

    for (const card of edhrecCards) {
        if (!card?.name) continue;

        map.set(
        normalizeCardName(card.name),
        Number(card.synergy) || 0
        );
    }
    return map;
}

// Construye mapa de co-ocurrencia
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

        const normalized =
        (card.num_decks || 0) / maxDecks;

        map.set(
        normalizeCardName(card.name),
        normalized
        );
    }

    return map;
}

// ---------- SINERGIA ENTRE CARTAS ----------

// Grupos de palabras clave que generan sinergia entre sí
const keywordSynergies = [
  { keys: ["token", "create"], value: 0.15 },
  { keys: ["draw", "discard"], value: 0.10 },
  { keys: ["gain life", "life total", "lifelink", "pay life", "whenever you gain life"], value: 0.15 },
  { keys: ["+1/+1 counter", "proliferate"], value: 0.15 },
  { keys: ["graveyard", "return from", "mill", "reanimate"], value: 0.10 },
  { keys: ["artifact", "treasure", "clue", "food"], value: 0.10 },
  { keys: ["burn", "damage to target", "damage to each"], value: 0.15 }
];

export function computeDeckSynergyMap(candidates, selectedCards) {
    const map = new Map();

    for (const card of candidates) {
        let synergy = 0;

        for (const selected of selectedCards) {
        if (card.type_line === selected.type_line) {
            synergy += 0.05;
        }

        const cardText = card.oracle_text?.toLowerCase() ?? "";
        const selectedText = selected.oracle_text?.toLowerCase() ?? "";

        // Evaluamos sinergias cruzando las palabras clave
        for (const group of keywordSynergies) {
            const cardMatch = group.keys.some(k => cardText.includes(k));
            const selectedMatch = group.keys.some(k => selectedText.includes(k));
            
            if (cardMatch && selectedMatch) {
                synergy += group.value;
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
    return 1 / Math.log(rank + 10);
}

// ---------- SCORE PRINCIPAL ----------

export function computeCardScore({card, collectionCounts, commanderSynergyMap, deckSynergyMap, cooccurrenceMap, theme, weights = defaultWeights}) {
    const name = normalizeCardName(card.name);
    let score = 0;

    // Si el usuario la tiene
    if (collectionCounts.has(name)) {
        score += weights.owned;
    }

    // Comprobar Sinergia de Arquetipo / Tema
    if (theme && theme !== "none" && themePatterns[theme]) {
       const text = (card.oracle_text || "").toLowerCase();
       const typeMatch = (card.type_line || "").toLowerCase();
       // Si el texto de la carta u originariamente su tipo tiene relación con las mecánicas clave del arquetipo
       if (text.match(themePatterns[theme]) || typeMatch.match(themePatterns[theme])) {
         score += weights.themeMatch;
       }
    }

    // Sinergia con comandante
    const commanderSynergy = commanderSynergyMap.get(name) ?? 0;
    score += commanderSynergy * weights.commanderSynergy;

    // Sinergia con el resto del mazo
    const deckSynergy = deckSynergyMap.get(name) ?? 0;
    score += deckSynergy * weights.deckSynergy;

    // Co-ocurrencia
    const cooccurrence = cooccurrenceMap.get(name) ?? 0;
    score += cooccurrence * weights.cooccurrence;

    // Popularidad
    const popularity = computePopularityScore(card.edhrec_rank);
    score += popularity * weights.popularity;

    return score;
}

// ---------- ORDENACIÓN ----------

export function sortByScore({
cards,
collectionCounts,
commanderSynergyMap,
deckSynergyMap,
cooccurrenceMap,
theme,
weights = defaultWeights
}) {
return [...cards].sort((a, b) => {
    const scoreA = computeCardScore({
    card: a,
    collectionCounts,
    commanderSynergyMap,
    deckSynergyMap,
    cooccurrenceMap,
    theme,
    weights
    });

    const scoreB = computeCardScore({
    card: b,
    collectionCounts,
    commanderSynergyMap,
    deckSynergyMap,
    cooccurrenceMap,
    theme,
    weights
    });

    return scoreB - scoreA;
    });
}