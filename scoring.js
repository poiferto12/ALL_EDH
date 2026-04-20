// scoring.js

// ---------- DEFAULT ----------

export const defaultWeights = {
owned: 50,
commanderSynergy: 100,  // PESO MÁXIMO: Sinergia cruda de EDHREC
cooccurrence: 80,       // PESO MÁXIMO: Popularidad en EDHREC
popularity: 40,         // Datos de Scryfall (EDHREC Rank Global)
themeMatch: 15,         // Ligero empujón si hemos elegido un Arquetipo
deckSynergy: 0          // Desactivamos la sinergia artificial por texto
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

  // Ramp (Ignoramos tesoros u otros recursos si especifican que se los da al jugador objetivo o rival)
  if (
    (text.match(/\b(add \{|search your library for a.*land|create.*treasure)\b/) || text.match(/\b(enchant land).*(produce).*(mana)\b/)) &&
    !text.match(/\b(its controller creates|that player creates|opponent creates|opponents create)\b/)
  ) {
    tags.push("ramp");
  }

  // Draw (Robo y exilio para jugar, evitando robar al oponente en removal)
  if (
    (text.match(/\b(draw(s)? \w* ?card|exile the top.*play|look at the top.*put.*into your hand)\b/) && !text.includes("return target")) &&
    !text.match(/\b(its controller draws|that player draws|opponent draws|opponents draw)\b/)
  ) {
    tags.push("draw");
  }

  // Wipe (Limpiamesas)
  if (text.match(/\b(destroy all|exile all|damage to each creature|all creatures get -|put all creatures on the bottom)\b/)) {
    tags.push("wipe");
  }
  // Removal (Destruir permanent/creature localmente, rebotar)
  else if (text.match(/\b(destroy target|exile target|return target.*hand|deals damage to target)\b/) && !text.match(/target.*you control/)) {
    tags.push("removal");
  }

  // Tutores
  if (text.match(/\b(search your library for a(n)?(?!.*basic land)|search your library and put)\b/)) {
    tags.push("tutor");
  }

  // Protección / Counterspells (ahora atrapa "counter target noncreature spell")
  if (text.match(/\b(hexproof|indestructible|protection from|counter target.*spell|prevent all combat damage)\b/)) {
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

    // Helper para extraer tribus clave (Goblins, Elves, Zombies...)
    const getTribes = (typeLine = "") => {
        // Scryfall suele usar el em-dash "—" pero por si acaso dividimos por "-" o "—"
        const parts = typeLine.split(/—|-/);
        if (parts.length > 1) {
             return parts[1].trim().toLowerCase().split(/\s+/)
             .filter(t => t && !["human", "legendary", "creature", "artifact", "basic", "snow", "land"].includes(t));
        }
        return [];
    };

    for (const card of candidates) {
        let synergy = 0;
        
        const cardText = card.oracle_text?.toLowerCase() ?? "";
        const cardTypes = getTribes(card.type_line);

        for (const selected of selectedCards) {
            const selectedText = selected.oracle_text?.toLowerCase() ?? "";
            const selectedTypes = getTribes(selected.type_line);

            // 1. Sinergia Tribal Inteligente (Diferencia "Goblins" de "Warriors")
            for (const tribe of selectedTypes) {
                // Chequear si el comandante menciona explícitamente esta tribu en su caja de texto (es su "Clase Principal")
                // Ej: Krenko menciona "Goblin". No menciona "Warrior". Por tanto, Goblin será Primaria, Warrior secundaria.
                const isPrimaryTribe = selectedText.match(new RegExp(`\\b${tribe}s?\\b`, 'i'));
                const multiplier = isPrimaryTribe ? 2.5 : 0.05; // Salto gigantesco si es tribu primaria

                if (cardTypes.includes(tribe)) synergy += multiplier; 
                if (cardText.match(new RegExp(`\\b${tribe}s?\\b`, 'i'))) synergy += (multiplier * 0.8);
            }
            
            // Y extra: Si la carta es de un tipo que el Comandante menciona explícitamente pero no comparte con él (Ej: crea Tokens de otro tipo)
            for (const tribe of cardTypes) {
                if (!selectedTypes.includes(tribe) && selectedText.match(new RegExp(`\\b${tribe}s?\\b`, 'i'))) {
                    synergy += 2.0;
                }
            }

            if (card.type_line === selected.type_line) {
                synergy += 0.05;
            }

            // 2. Evaluamos sinergias cruzando las palabras clave
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

export function computeCardScore({card, collectionCounts, commanderSynergyMap, deckSynergyMap, cooccurrenceMap, theme, bracket, weights = defaultWeights}) {
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

    // Modificadores por Nivel de Poder (Bracket)
    if (bracket && bracket !== "any") {
        const cmc = card.cmc || 0;
        const tags = getCardTags(card);
        
        if (bracket === "1") {
            // Bracket 1 (Jank/Casual): Cero tutores, cero fast mana, premia coste alto.
            if (cmc >= 6) score += 20;
            if (tags.includes("tutor")) score -= 50;
            if (tags.includes("ramp") && cmc <= 1) score -= 50;
        } else if (bracket === "2") {
            // Bracket 2 (Preconstruido): Curva media-alta, poquísima tutorización y sin artefactos rotos de coste 0.
            if (cmc >= 5) score += 10;
            if (tags.includes("tutor")) score -= 30;
            if (tags.includes("ramp") && cmc === 0 && name !== "solring") score -= 40; // Elimina Mana Crypt etc.
        } else if (bracket === "3") {
            // Bracket 3 (Mejorado): Empieza a buscar algo de sinergia, castiga el maná rápido excesivo pero permite herramientas sólidas.
            if (tags.includes("tutor")) score -= 10;
            if (cmc >= 6) score += 5; 
            if (tags.includes("ramp") && cmc === 0 && name !== "solring") score -= 20; 
        } else if (bracket === "4") {
            // Bracket 4 (High Power): Optimizado. Costes eficientes, counters, tutores habituales. No quiere bichos caros aburridos.
            if (cmc <= 3) score += 15;
            if (tags.includes("tutor") || tags.includes("protection")) score += 15;
            if (cmc >= 6) score -= 15;
        } else if (bracket === "5") {
            // Bracket 5 (cEDH): Maná ultrarrápido, tutores obligatorios, curva bajísima, todo al mínimo CMC.
            if (cmc <= 2) score += 30;
            if (cmc >= 5) score -= 40;
            if (tags.includes("tutor") || tags.includes("protection")) score += 30;
            if (tags.includes("ramp") && cmc <= 1) score += 50; 
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
bracket,
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
    bracket,
    weights
    });

    const scoreB = computeCardScore({
    card: b,
    collectionCounts,
    commanderSynergyMap,
    deckSynergyMap,
    cooccurrenceMap,
    theme,
    bracket,
    weights
    });

    return scoreB - scoreA;
    });
}