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

async function fetchCandidates(colorIdentity, theme, edhrecNames = []) {
  const identity = colorIdentity.length ? colorIdentity.join('') : 'c';
  const allCards = [];

  // 1. Obtener las cartas exactas que EDHREC recomienda (si existen)
  if (edhrecNames.length > 0) {
    const chunkSize = 75;
    for (let i = 0; i < edhrecNames.length; i += chunkSize) {
      const chunk = edhrecNames.slice(i, i + chunkSize);
      const identifiers = chunk.map(name => ({ name }));
      try {
        const response = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifiers })
        });
        const data = await response.json();
        if (data.data) {
          allCards.push(...data.data.filter((card) => card.layout !== 'art_series'));
        }
      } catch (e) {
        console.warn("Falla al obtener colección de Scryfall", e);
      }
      await new Promise(r => setTimeout(r, 60));
    }
  }

  // Traducción de la temática a un término de búsqueda para enriquecer la piscina de Scryfall
  let themeQuery = '';
  switch (theme) {
    case 'voltron': themeQuery = ' (t:equipment OR t:aura)'; break;
    case 'tokens': themeQuery = ' (o:token OR o:create)'; break;
    case 'lifegain': themeQuery = ' (o:"gain life" OR o:"lifelink")'; break;
    case 'aristocrats': themeQuery = ' (o:sacrifice OR o:"dies")'; break;
    case 'graveyard': themeQuery = ' (o:"from your graveyard" OR o:mill OR o:reanimate OR o:dredge)'; break;
    case 'artifacts': themeQuery = ' t:artifact'; break;
    case 'storm': themeQuery = ' (o:"instant or sorcery" OR o:magecraft)'; break;
    case 'burn': themeQuery = ' (o:"damage to any" OR o:"damage to target" OR o:"damage to each")'; break;
    case 'aggro': themeQuery = ' (o:haste OR o:trample OR o:menace)'; break;
    default: themeQuery = '';
  }

  // 2. Traer cartas populares del formato (staples genéricas) para asegurar que haya Removal, Wipes, Ramp, etc.
  // Añadimos una búsqueda secundaria genérica sin filtrar por 'theme' para evitar quedarnos sin cosas básicas
  const query = `format:commander game:paper unique:cards -type:basic identity<=${identity}`;
  let url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(query)}&order=edhrec&dir=asc`;

  for (let i = 0; i < 2; i++) {
    if (!url) break;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) break;
      const newCards = data.data.filter((c) => c.layout !== 'art_series' && !allCards.some(existing => existing.name === c.name));
      allCards.push(...newCards);
      url = data.has_more ? data.next_page : null;
      if (url) await new Promise(r => setTimeout(r, 60));
    } catch (e) {
      break;
    }
  }

  // 3. Traer un lote extra ESPECÍFICO del arquetipo para asegurar densidad de esa estrategia (si eligió temática)
  if (themeQuery) {
    const tQuery = `${query}${themeQuery}`;
    let tUrl = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(tQuery)}&order=edhrec&dir=asc`;
    try {
      const response = await fetch(tUrl);
      const data = await response.json();
      if (response.ok && data.data) {
        const themeCards = data.data.filter((c) => c.layout !== 'art_series' && !allCards.some(existing => existing.name === c.name));
        allCards.push(...themeCards);
      }
    } catch (e) {
      // ignorar si no hay más
    }
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
  const tiposActivos = { creature: 0, artifact: 0, enchantment: 0, instant: 0, sorcery: 0, planeswalker: 0 };

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
      if ((costTotalComprar + addedCost) > plantillas.maxBudget) continue;
      if (addedCost > maxPriceLimit) continue; 
    }

    const tags = getCardTags(card);
    let assigned = false;

    // Identificación del tipo de carta principal (para imponer los límites)
    let mainType = null;
    const typeLine = (card.type_line || "").toLowerCase();
    if (!typeLine.includes("land")) {
      if (typeLine.includes("creature")) mainType = "creature";
      else if (typeLine.includes("artifact")) mainType = "artifact";
      else if (typeLine.includes("enchantment")) mainType = "enchantment";
      else if (typeLine.includes("instant")) mainType = "instant";
      else if (typeLine.includes("sorcery")) mainType = "sorcery";
      else if (typeLine.includes("planeswalker")) mainType = "planeswalker";
    }

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

    // Comprobamos si hemos sobrepasado el Límite de Tipo de esta carta (Ej: Si ya tenemos 15 Artefactos, no metemos más)
    let assignedRole = null;
    
    // 1. Verificamos si la carta puede cumplir alguna función necesaria (wipes, tutor, etc)
    for (const d of ['wipe', 'removal', 'draw', 'ramp', 'tutor', 'protection', 'recursion']) {
      if (tags.includes(d) && rolesActivos[d] < plantillas[d]) {
        assignedRole = d;
        break;
      }
    }

    // 2. Si no, evaluamos si puede entrar de relleno "flexible" en el mazo principal
    if (!assignedRole && rolesActivos.flex < plantillas.flex) {
      assignedRole = "flex synergy";
    }

    // Si la carta no cabe ni funcionalmente ni en el relleno, la ignoramos
    if (!assignedRole) continue;

    // 3. Comprobamos límites de Tipo de Carta (Ej: Máximo 15 Artefactos)
    if (mainType && tiposActivos[mainType] >= plantillas[mainType]) {
      // Si el cupo está lleno, pero nuestra nueva carta es FUNCIONAL (no flex), 
      // buscamos en el mazo el artefacto/criatura "flex" que hayamos metido antes con MENOR score natural y lo EXPULSAMOS.
      if (assignedRole !== "flex synergy") {
        let replaced = false;
        // Recorremos el deck desde el final hacía atrás (los del final tienen menor score por la ordenación)
        for (let i = deckFinal.length - 1; i >= 0; i--) {
          if (deckFinal[i]._mainType === mainType && deckFinal[i]._assignedRole === "flex synergy") {
            const removedCard = deckFinal.splice(i, 1)[0];
            const removedCost = collectionCounts.has(normalizeCardName(removedCard.name)) ? 0 : parseFloat(removedCard.prices?.usd || 0);
            costTotalComprar -= removedCost;
            cmcSum -= removedCard.cmc || 0;
            nonLandCount--;
            tiposActivos[mainType]--;
            rolesActivos.flex--; // Liberamos un hueco flex para el futuro
            replaced = true;
            break;
          }
        }
        if (!replaced) continue; // No había cartas de relleno para expulsar, el cupo genérico está estricto.
      } else {
        continue; // La carta es sólo flex y su cupo de tipo está lleno. Fuera.
      }
    }
    
    // Si pasamos todas las barreras, registramos e insertamos la carta elegida
    rolesActivos[assignedRole === "flex synergy" ? "flex" : assignedRole]++;
    card._assignedRole = assignedRole;
    card._mainType = mainType;
    deckFinal.push(card);
    
    costTotalComprar += addedCost;
    cmcSum += card.cmc || 0;
    nonLandCount++;
    if (mainType) tiposActivos[mainType]++;
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
      maxBudget: parseFloat(form.budget.value) || 0,
      creature: parseInt(form.creature.value) || 30,
      artifact: parseInt(form.artifact.value) || 15,
      enchantment: parseInt(form.enchantment.value) || 15,
      instant: parseInt(form.instant.value) || 15,
      sorcery: parseInt(form.sorcery.value) || 15,
      planeswalker: parseInt(form.planeswalker.value) || 5
    };

    // Obtenemos el Arquetipo / Estrategia y el Bracket del dropdown
    const theme = form.theme.value;
    const bracket = form.bracket.value;

    // 2. Consultamos la API local de EDHREC para extraer los nombres clave
    const edhrecData = await fetchEdhrecData(commander.name);
    let edhrecNames = [];

    let commanderSynergyMap = new Map();
    let cooccurrenceMap = new Map();

    if (edhrecData && edhrecData.cardlist) {
      edhrecNames = edhrecData.cardlist.map(c => c.name).filter(Boolean);
      commanderSynergyMap = buildCommanderSynergyMap(edhrecData.cardlist);
      cooccurrenceMap = buildCooccurrenceMap(edhrecData.cardlist);
    }

    // 3. Traemos todos los candidatos de Scryfall (EDHREC + Genéricas + Temáticas)
    const candidates = await fetchCandidates(commander.color_identity || [], theme, edhrecNames);
    const withoutCommander = candidates.filter((card) => card.name !== commander.name);

    // Calculamos sinergia estática basándonos en el comandante como "cartas seleccionadas" iniciales
    const deckSynergyMap = computeDeckSynergyMap(withoutCommander, [commander]);

    const scoringContext = {
      commanderSynergyMap,
      deckSynergyMap,
      cooccurrenceMap,
      theme,
      bracket
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
