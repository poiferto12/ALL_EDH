import {
  sortByScore,
  buildCommanderSynergyMap,
  buildCooccurrenceMap,
  computeDeckSynergyMap,
  normalizeCardName,
  computeCardScore,
  getCardTags
} from "./scoring.js";

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

// Nuevo orden bonito y diccionario de textos
const roleDisplayNames = {
  land: "Tierras",
  ramp: "Aceleración de Maná (Ramp)",
  draw: "Robo de Cartas (Draw)",
  tutor: "Tutores",
  removal: "Destrucción / Removal",
  wipe: "Limpiamesas (Wipes)",
  protection: "Protección / Counters",
  recursion: "Recursión del Cementerio",
  "flex synergy": "Sinergia Principal (Flex)",
  "flex fallback": "Relleno Funcional (Fallback)"
};

function renderRecommendations(recommendations, collectionCounts, scoringContext) {
  const container = document.getElementById('recommendations');
  container.replaceChildren(); // Limpia la lista

  // Agrupamos las cartas por rol
  const groups = {};
  for (const card of recommendations) {
    const role = card._assignedRole || "flex fallback";
    if (!groups[role]) groups[role] = [];
    groups[role].push(card);
  }

  // Iteramos sobre las categorías en el orden en el que queremos que se vean
  for (const [roleKey, roleName] of Object.entries(roleDisplayNames)) {
    const cardsInRole = groups[roleKey];
    if (!cardsInRole || cardsInRole.length === 0) continue;

    // Crea la caja/categoría
    const section = document.createElement('section');
    section.className = 'category-section';

    // Crea el encabezado
    const header = document.createElement('h3');
    header.className = 'category-header';
    header.textContent = roleName;
    
    // Cuenta de cartas
    const countBadge = document.createElement('span');
    countBadge.className = 'category-count';
    countBadge.textContent = cardsInRole.length;
    header.appendChild(countBadge);

    section.appendChild(header);

    // Contenedor de iteraciones de cartas
    const list = document.createElement('ul');
    list.className = 'card-list';

    for (const card of cardsInRole) {
      const item = document.createElement('li');
      item.className = 'card-item';
      item.setAttribute('data-role', roleKey); // Para darle el color CSS
      
      const finalScore = computeCardScore({
        card, 
        collectionCounts, 
        ...scoringContext 
      });

      // 1. Imagen pequeña de previsualización
      const dropUrl = card.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.art_crop || '';
      if (dropUrl) {
        const miniImg = document.createElement('img');
        miniImg.src = dropUrl;
        miniImg.className = 'card-image';
        miniImg.loading = 'lazy';
        item.appendChild(miniImg);
      }

      // Contenedor del contenido textual
      const contentBox = document.createElement('div');
      contentBox.className = 'card-content';

      // Primer bloque flex (Nombre y Badge)
      const infoRow = document.createElement('div');
      infoRow.className = 'card-info';
      
      const nameEl = document.createElement('span');
      nameEl.textContent = card.name;
      nameEl.style.whiteSpace = 'nowrap';
      nameEl.style.overflow = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';
      nameEl.style.marginRight = '0.5rem';
      infoRow.appendChild(nameEl);

      const isOwned = collectionCounts.has(normalizeCardName(card.name));
      const badge = createBadge(isOwned ? 'En colección' : 'Falta', isOwned ? 'badge-owned' : 'badge-missing');
      badge.style.flexShrink = '0';
      infoRow.appendChild(badge);
      
      // Segundo bloque paramétrico (Precio, cmc y puntaje)
      const ptsRow = document.createElement('div');
      ptsRow.className = 'card-pts';
      ptsRow.textContent = `Pts: ${finalScore.toFixed(1)} · CMR: ${card.cmc || 0} · Precio: $${parseFloat(card.prices?.usd || 0).toFixed(2)}`;

      contentBox.appendChild(infoRow);
      contentBox.appendChild(ptsRow);
      item.appendChild(contentBox);
      list.appendChild(item);

      // Eventos para mostrar la carta completa estilo Tooltip (Full Card)
      const fullImageUrl = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal;
      
      if (fullImageUrl) {
        const tooltip = document.getElementById('card-tooltip');
        const tooltipImg = document.getElementById('tooltip-img');

        item.addEventListener('mouseenter', () => {
          tooltipImg.src = fullImageUrl;
          tooltip.style.display = 'block';
        });

        item.addEventListener('mousemove', (e) => {
          // Posicionamos el tooltip evitando que se salga por debajo de la pantalla
          let tooltipX = e.clientX + 20;
          let tooltipY = e.clientY - 100;
          
          if (tooltipY + 350 > window.innerHeight) {
            tooltipY = window.innerHeight - 360;
          }
          if (tooltipX + 260 > window.innerWidth) {
            tooltipX = e.clientX - 280; // Si no cabe por la derecha, lo ponemos a la izquierda del ratón
          }

          tooltip.style.left = `${tooltipX}px`;
          tooltip.style.top = `${tooltipY}px`;
        });

        item.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
          tooltipImg.src = '';
        });
      }
    }
    
    section.appendChild(list);
    container.appendChild(section);
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
  const url = `http://localhost:8000/api/commander/${encodeURIComponent(commanderName)}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    console.warn(`No se encontraron datos en el servidor local para ${commanderName}`);
    return null;
  }
  return response.json();
}

async function handleSubmit(event) {
  event.preventDefault();
  updateText('status', 'Buscando comandante y cartas recomendadas...');
  updateText('summary', '');
  document.getElementById('recommendations').replaceChildren();

  const form = event.currentTarget;
  const commanderName = form.commander.value.trim();
  const collectionCounts = parseCollection(form.collection.value);

  if (!commanderName) {
    updateText('status', 'Debes indicar un comandante.');
    return;
  }

  try {
    // 1. Validamos al Comandante en Scryfall (para tener el nombre exacto e identidad)
    const commander = await fetchCommander(commanderName);
    
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
    const withoutCommander = candidates.filter((card) => card.name !== commander.name);
    
    // 3. Consultamos la API oculta de EDHREC
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
    updateText('status', `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  }
}

if (typeof document !== 'undefined') {
  document.getElementById('deck-form').addEventListener('submit', handleSubmit);
}
