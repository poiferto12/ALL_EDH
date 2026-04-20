console.log("[v0] app.js starting to load...");

import {
  sortByScore,
  buildCommanderSynergyMap,
  buildCooccurrenceMap,
  computeDeckSynergyMap,
  normalizeCardName,
  computeCardScore,
  getCardTags
} from "./scoring.js";

console.log("[v0] scoring.js imported successfully");

const SCRYFALL_BASE = 'https://api.scryfall.com';

export function parseCollection(input) {
  const counts = new Map();

  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    const qty = match ? Number.parseInt(match[1], 10) : 1;
    const name = match ? match[2] : line;
    const key = normalizeCardName(name);

    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + Math.max(qty, 1));
  }

  return counts;
}

async function fetchCommander(commanderName) {
  const url = `${SCRYFALL_BASE}/cards/named?exact=${encodeURIComponent(commanderName)}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.details || 'No se pudo encontrar el comandante.');
  }

  if (!data.legalities || data.legalities.commander !== 'legal') {
    throw new Error('La carta indicada no es legal como comandante en Commander.');
  }

  return data;
}

async function fetchCandidates(colorIdentity) {
  const identity = colorIdentity.length ? colorIdentity.join('') : 'c';
  const query = `format:commander game:paper unique:cards -type:basic identity<=${identity}`;
  let url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(query)}&order=edhrec&dir=asc`;

  const allCards = [];
  
  // Scryfall pagina sus resultados a 175 cartas. Iteraremos 3 veces para recolectar ~525 cartas.
  // Con esto aseguramos de tener una piscina inmensa descartando problemas de "No encuentra suficientes".
  for (let i = 0; i < 3; i++) {
    if (!url) break;
    
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      if (allCards.length > 0) break; // Si ya teníamos algo, no rompas, devuélvelo
      throw new Error(data?.details || 'No se pudieron obtener sugerencias desde Scryfall.');
    }

    allCards.push(...data.data.filter((card) => card.layout !== 'art_series'));
    url = data.has_more ? data.next_page : null;
    
    // Scryfall pide en sus docs 50-100ms de retraso entre páginas
    if (url) await new Promise(r => setTimeout(r, 60));
  }

  return allCards;
}

function createBadge(text, className) {
  const badge = document.createElement('span');
  badge.textContent = text;
  badge.className = `badge ${className}`;
  return badge;
}

function renderRecommendations(recommendations, collectionCounts, scoringContext) {
  const list = document.getElementById('recommendations');
  list.replaceChildren();

  // Ahora recommendations ya viene con un atributo decorativo _assignedRole  
  for (const card of recommendations) {
    const item = document.createElement('li');
    
    // Mostramos la puntuación final para darle feedback al usuario del por qué
    const finalScore = computeCardScore({
      card, 
      collectionCounts, 
      ...scoringContext 
    });
    
    // Mostramos el Rol asignado y la Puntuación
    const role = (card._assignedRole || "flex").toUpperCase();
    item.textContent = `[${role}] ${card.name} (Pts: ${finalScore.toFixed(1)})`;

    const owned = collectionCounts.has(normalizeCardName(card.name));
    item.appendChild(createBadge(owned ? 'En colección' : 'Falta', owned ? 'badge-owned' : 'badge-missing'));
    list.appendChild(item);
  }

  return recommendations;
}

// NUEVO: Algoritmo para intentar construir el mazo con un límite máximo por carta.
function attemptBuildDeck(orderedCards, plantillas, collectionCounts, maxPriceLimit) {
  const deckFinal = [];
  const rolesActivos = { land: 0, ramp: 0, draw: 0, wipe: 0, removal: 0, tutor: 0, protection: 0, recursion: 0, flex: 0 };
  
  // Total de cartas forzadas 
  const asignadasExplicitas = plantillas.land + plantillas.ramp + plantillas.draw + plantillas.wipe + plantillas.removal + plantillas.tutor + plantillas.protection + plantillas.recursion;
  plantillas.flex = Math.max(0, 99 - asignadasExplicitas);

  let costTotalComprar = 0;
  let cmcSum = 0;
  let nonLandCount = 0;

  for (const card of orderedCards) {
    if (deckFinal.length >= 99) break;

    const isOwned = collectionCounts.has(normalizeCardName(card.name));
    const cardPrice = parseFloat(card.prices?.usd || 0);
    const addedCost = isOwned ? 0 : cardPrice;

    // Control de límite de presupuesto y distribución equilibrada (anti-monopolio)
    if (plantillas.maxBudget > 0) {
      // 1. Que no sobrepase el total
      if ((costTotalComprar + addedCost) > plantillas.maxBudget) {
        continue;
      }
      
      // 2. Que no acapare excesivo presupuesto (usar el límite dictado por el intento actual)
      if (addedCost > maxPriceLimit) {
        continue; 
      }
    }

    const tags = getCardTags(card);
    let assigned = false;

    // Tierras
    if (tags.includes('land')) {
      if (rolesActivos.land < plantillas.land) {
        rolesActivos.land++;
        card._assignedRole = "land";
        deckFinal.push(card);
        costTotalComprar += addedCost;
      }
      continue;
    }

    // Funcionales
    for (const d of ['wipe', 'removal', 'draw', 'ramp', 'tutor', 'protection', 'recursion']) {
      if (tags.includes(d) && rolesActivos[d] < plantillas[d]) {
        rolesActivos[d]++;
        card._assignedRole = d;
        deckFinal.push(card);
        assigned = true;
        break;
      }
    }

    // Flexibles
    if (!assigned && rolesActivos.flex < plantillas.flex) {
      rolesActivos.flex++;
      card._assignedRole = "flex synergy";
      deckFinal.push(card);
      assigned = true;
    }
    
    if (assigned) {
      costTotalComprar += addedCost;
      cmcSum += card.cmc || 0;
      nonLandCount++;
    }
  }

  // 1. Relleno de emergencia para Tierras:
  // Si encontramos menos tierras no básicas en las sugerencias de las que la plantilla requería, rellenamos el resto con básicas
  while (rolesActivos.land < plantillas.land && deckFinal.length < 99) {
    deckFinal.push({
      name: "Tierra Básica (Placeholder)",
      type_line: "Basic Land",
      _assignedRole: "land",
      prices: { usd: "0" },
      cmc: 0
    });
    rolesActivos.land++;
  }

  // 2. Si los tags funcionales (wipes, tutor, etc.) no lograron llenarse, habrán quedado huecos vacíos en las 99 cartas.
  // Rescatamos las mejores cartas sobrantes de todo el pool para asegurarnos de ofrecer 99 cartas funcionales sí o sí.
  if (deckFinal.length < 99) {
    for (const card of orderedCards) {
      if (deckFinal.length >= 99) break;
      if (deckFinal.includes(card)) continue; // Ya estaba en el mazo

      const isOwned = collectionCounts.has(normalizeCardName(card.name));
      const addedCost = isOwned ? 0 : parseFloat(card.prices?.usd || 0);

      // Verificamos presupuesto de este intento
      if (plantillas.maxBudget > 0) {
        if ((costTotalComprar + addedCost) > plantillas.maxBudget) continue;
        if (addedCost > maxPriceLimit) continue;
      }

      card._assignedRole = "flex fallback";
      deckFinal.push(card);
      costTotalComprar += addedCost;
      cmcSum += card.cmc || 0;
      nonLandCount++;
    }
  }

  return {
    cards: deckFinal,
    stats: {
      cost: costTotalComprar,
      avgCmc: nonLandCount > 0 ? (cmcSum / nonLandCount) : 0
    }
  };
}

// Wrapper para intentar construir el mazo bajando el límite de precio si no logra las 99 cartas
function buildDeckPorPlantilla(orderedCards, plantillas, collectionCounts) {
  if (plantillas.maxBudget <= 0) {
    return attemptBuildDeck(orderedCards, plantillas, collectionCounts, Infinity);
  }

  let bestDeck = null;
  // Empezar permitiendo cartas que cuesten hasta el 20% del presupuesto
  let currentMaxPrice = Math.max(plantillas.maxBudget * 0.20, 2.0);

  // Hacemos hasta 6 intentos bajando agresivamente el precio máximo permitido
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = attemptBuildDeck(orderedCards, plantillas, collectionCounts, currentMaxPrice);
    
    // Si logramos las 99 cartas, o si no hay mejor opción anterior, lo guardamos
    if (!bestDeck || result.cards.length > bestDeck.cards.length) {
      bestDeck = result;
    }

    // Si ya llegamos al máximo posible (99), detenemos los intentos
    if (result.cards.length === 99) {
      break;
    }

    // Para el siguiente intento, reducimos el precio máximo permitido a la mitad
    currentMaxPrice *= 0.5; 
  }

  return bestDeck;
}

function updateText(id, text) {
  const node = document.getElementById(id);
  node.textContent = text;
}

async function fetchEdhrecData(commanderName) {
  try {
    const url = `http://localhost:8000/api/commander/${encodeURIComponent(commanderName)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    // EDHREC server not available - this is expected in production
    return null;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  console.log("[v0] handleSubmit called");
  
  const submitBtn = document.getElementById('submit-btn');
  const form = event.currentTarget;
  const commanderName = form.commander.value.trim();
  console.log("[v0] Commander name:", commanderName);
  
  if (!commanderName) {
    updateText('status', 'Debes indicar un comandante.');
    return;
  }
  
  // Set loading state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Generando...';
  document.body.classList.add('loading');
  
  updateText('status', 'Buscando comandante...');
  updateText('summary', '');
  document.getElementById('recommendations').replaceChildren();

  const collectionCounts = parseCollection(form.collection.value);

  try {
    console.log("[v0] Starting try block...");
    // 1. Validamos al Comandante en Scryfall (para tener el nombre exacto e identidad)
    console.log("[v0] Fetching commander from Scryfall...");
    const commander = await fetchCommander(commanderName);
    console.log("[v0] Commander found:", commander.name);
    updateText('status', `Comandante encontrado: ${commander.name}. Buscando cartas...`);
    
    // Extraemos la cantidad de categorías pedida (Plantilla HTML) y el presupuesto
    const plantillas = {
      land: parseInt(form.lands.value) || 36,
      ramp: parseInt(form.ramp.value) || 10,
      draw: parseInt(form.draw.value) || 10,
      removal: parseInt(form.removal.value) || 8,
      wipe: parseInt(form.wipe.value) || 3,
      tutor: parseInt(form.tutor.value) || 2,
      recursion: parseInt(form.recursion.value) || 3,
      protection: parseInt(form.protection.value) || 5,
      maxBudget: parseFloat(form.budget.value) || 0
    };

    // 2. Traemos todos los posibles candidatos válidos de Scryfall
    const candidates = await fetchCandidates(commander.color_identity || []);
    updateText('status', `Encontradas ${candidates.length} cartas candidatas. Calculando sinergia...`);
    
    const withoutCommander = candidates.filter((card) => card.name !== commander.name);
    
    // 3. Consultamos la API oculta de EDHREC (opcional, timeout de 2s)
    const edhrecData = await fetchEdhrecData(commander.name);
    
    // Obtenemos el Arquetipo / Estrategia del dropdown
    const theme = form.theme.value;

    let commanderSynergyMap = new Map();
    let cooccurrenceMap = new Map();

    if (edhrecData && edhrecData.cardlist) {
      // Usamos las funciones de scoring.js con la cardlist de EDHREC
      commanderSynergyMap = buildCommanderSynergyMap(edhrecData.cardlist);
      cooccurrenceMap = buildCooccurrenceMap(edhrecData.cardlist);
    }

    // Calculamos sinergia estática basándonos en el comandante como "cartas seleccionadas" iniciales
    const deckSynergyMap = computeDeckSynergyMap(withoutCommander, [commander]);

    const scoringContext = {
      commanderSynergyMap,
      deckSynergyMap,
      cooccurrenceMap,
      theme
    };

    const ordered = sortByScore({
      cards: withoutCommander,
      collectionCounts,
      ...scoringContext
    });

    const deckData = buildDeckPorPlantilla(ordered, plantillas, collectionCounts);

    const chosen = renderRecommendations(
      deckData.cards, 
      collectionCounts, 
      scoringContext
    );

    const owned = chosen.filter((card) => collectionCounts.has(normalizeCardName(card.name))).length;
    const missing = chosen.length - owned;

    updateText('status', `Comandante: ${commander.name}`);
    const completenessNote =
      chosen.length < 99
        ? ` Aviso: Solo se encontraron ${chosen.length} cartas válidas bajo estos criterios.`
        : '';
    updateText(
      'summary',
      `Resultados: ${chosen.length} cartas (${owned} en colección). Presupuesto de inversión: $${deckData.stats.cost.toFixed(2)}. Curva de Maná promedio: ${deckData.stats.avgCmc.toFixed(2)}. ${completenessNote}`
    );
  } catch (error) {
    console.log("[v0] Error caught:", error);
    updateText('status', `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  } finally {
    // Reset loading state
    submitBtn.disabled = false;
    submitBtn.textContent = 'Generar Mazo';
    document.body.classList.remove('loading');
  }
}

if (typeof document !== 'undefined') {
  console.log("[v0] Document exists, setting up event listener...");
  const form = document.getElementById('deck-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
    console.log("[v0] Event listener attached to deck-form");
  } else {
    console.error("[v0] ERROR: deck-form not found!");
  }
}
console.log("[v0] app.js fully loaded");
