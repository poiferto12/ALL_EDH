console.log("[v0] app.js starting to load...");

import {
  sortByScoreIterative,
  buildCommanderSynergyMap,
  buildCooccurrenceMap,
  computeDeckSynergyMap,
  normalizeCardName,
  computeCardScore,
  getCardTags,
  analyzeCommander,
} from "./scoring.js";

const SCRYFALL_BASE = 'https://api.scryfall.com';

// ---------- TOOLTIP (position: fixed para seguir el ratón correctamente) ----------
let tooltip = null;
let tooltipImg = null;
if (typeof document !== 'undefined') {
  tooltip = document.createElement('div');
  tooltip.id = 'card-tooltip';
  tooltipImg = document.createElement('img');
  tooltipImg.id = 'card-tooltip-img';
  tooltipImg.alt = '';
  tooltip.appendChild(tooltipImg);
  document.body.appendChild(tooltip);
}

function getCardImageUrl(card) {
  if (!card) return null;
  if (card.image_uris?.normal)                    return card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris?.normal)   return card.card_faces[0].image_uris.normal;
  return null;
}

function showTooltip(card) {
  const url = getCardImageUrl(card);
  if (!url) return;
  tooltipImg.src = url;
  tooltip.classList.add('visible');
}

function moveTooltip(e) {
  const pad = 18, tw = 234, th = 326;
  let x = e.clientX + pad;
  let y = e.clientY - Math.round(th / 2);
  if (x + tw > window.innerWidth)        x = e.clientX - tw - pad;
  if (y < 4)                              y = 4;
  if (y + th > window.innerHeight - 4)   y = window.innerHeight - th - 4;
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
}

function hideTooltip() {
  tooltip.classList.remove('visible');
}

// Un único listener en document para mover el tooltip
if (typeof document !== 'undefined') document.addEventListener('mousemove', moveTooltip);

// ---------- PARSE COLLECTION ----------
export function parseCollection(input) {
  const counts = new Map();
  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    const qty  = match ? Number.parseInt(match[1], 10) : 1;
    const name = match ? match[2] : line;
    const canonical = name.trim().toLowerCase();
    const normKey = normalizeCardName(name);
    if (!canonical) continue;
    const q = Math.max(qty, 1);
    // Store both canonical (lowercase with spaces) and normalized key (no punctuation)
    counts.set(canonical, (counts.get(canonical) ?? 0) + q);
    counts.set(normKey, (counts.get(normKey) ?? 0) + q);
  }
  return counts;
}

// Simple utility used by tests: ordena poniendo primero cartas que ya tienes en la colección
export function sortRecommendations(cards, collection) {
  const norm = c => normalizeCardName(c.name);
  const canon = c => (c.name || '').trim().toLowerCase();
  return [...cards].sort((a, b) => {
    const aOwned = collection && (collection.has(norm(a)) || collection.has(canon(a))) ? 0 : 1;
    const bOwned = collection && (collection.has(norm(b)) || collection.has(canon(b))) ? 0 : 1;
    if (aOwned !== bOwned) return aOwned - bOwned;
    const ar = Number.isFinite(a.edhrec_rank) ? a.edhrec_rank : Number.MAX_SAFE_INTEGER;
    const br = Number.isFinite(b.edhrec_rank) ? b.edhrec_rank : Number.MAX_SAFE_INTEGER;
    return ar - br;
  });
}

// ---------- SCRYFALL ----------
async function fetchCommander(commanderName) {
  const res  = await fetch(`${SCRYFALL_BASE}/cards/named?exact=${encodeURIComponent(commanderName)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.details || 'No se pudo encontrar el comandante.');
  if (!data.legalities || data.legalities.commander !== 'legal')
    throw new Error('La carta indicada no es legal como comandante en Commander.');
  return data;
}

async function fetchCandidates(colorIdentity, commanderProfile) {
  const identity = colorIdentity.length ? colorIdentity.join('') : 'c';
  const baseQuery = `format:commander game:paper unique:cards -type:basic identity<=${identity}`;
  const extraFilters = [];

  if (commanderProfile) {
    if (commanderProfile.tribes.has('ally')) {
      extraFilters.push('o:ally');
    }
    const tribeTerms = [...commanderProfile.tribes].filter(t => t && t !== 'ally').slice(0, 3);
    for (const tribe of tribeTerms) {
      extraFilters.push(`(o:${tribe} OR type:${tribe})`);
    }
    if (commanderProfile.mechanics.has('tokens')) {
      extraFilters.push('(o:token OR o:"create token")');
    }
    if (commanderProfile.mechanics.has('graveyard')) {
      extraFilters.push('(o:graveyard OR o:reanimate OR o:flashback OR o:unearth)');
    }
    if (commanderProfile.mechanics.has('spells')) {
      extraFilters.push('(o:instant OR o:sorcery OR o:"copy target spell" OR o:magecraft OR o:spellslinger)');
    }
    if (commanderProfile.mechanics.has('equipment')) {
      extraFilters.push('(type:equipment OR o:equip OR o:equipment)');
    }
    if (commanderProfile.mechanics.has('landfall')) {
      extraFilters.push('o:landfall');
    }
  }

  const queries = [baseQuery];
  if (extraFilters.length > 0) {
    queries.push(`${baseQuery} ${extraFilters.join(' ')}`);
  }

  const all = [];
  const ids = new Set();

  for (let qi = 0; qi < queries.length; qi++) {
    let url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(queries[qi])}&order=edhrec&dir=asc`;
    const pages = qi === 0 ? 3 : 2;
    for (let i = 0; i < pages; i++) {
      if (!url) break;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) { if (all.length > 0) break; throw new Error(data?.details || 'Error en Scryfall.'); }
      for (const card of data.data.filter(c => c.layout !== 'art_series')) {
        if (!ids.has(card.id)) {
          ids.add(card.id);
          all.push(card);
        }
      }
      url = data.has_more ? data.next_page : null;
      if (url) await new Promise(r => setTimeout(r, 60));
    }
  }

  return all;
}

// Fetches las tierras básicas de los colores del comandante (con imagen real)
const COLOR_TO_BASIC = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };

async function fetchBasicLands(colorIdentity) {
  const basics = [];
  const colors = colorIdentity.length ? colorIdentity : ['W']; // fallback Wastes si incoloro
  for (const color of colors) {
    const basicName = COLOR_TO_BASIC[color];
    if (!basicName) continue;
    try {
      const res  = await fetch(`${SCRYFALL_BASE}/cards/named?exact=${encodeURIComponent(basicName)}`);
      const data = await res.json();
      if (res.ok) {
        // Marcamos como tierra básica para el builder
        data._isBasicLand  = true;
        data._basicColor   = color;
        basics.push(data);
      }
    } catch { /* ignorar errores individuales */ }
  }
  return basics;
}

// Tagger tags de Scryfall
async function fetchTaggerTags(scryfallId) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${SCRYFALL_BASE}/cards/${scryfallId}/tagger-tags`, { signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map(t => t.tag?.toLowerCase?.() || '').filter(Boolean);
  } catch { return []; }
}

// Construye el perfil del comandante enriquecido con Tagger
async function buildCommanderProfile(commander) {
  const profile = analyzeCommander(commander);
  const tags    = await fetchTaggerTags(commander.id);

  for (const tag of tags) {
    if (tag.startsWith('creature-type-')) {
      profile.tribes.add(tag.replace('creature-type-', '').replace(/-/g, ' '));
      profile.careAboutCreatureType = true;
    }
    const mechMap = {
      token: 'tokens', counter: 'counters', graveyard: 'graveyard',
      sacrifice: 'sacrifice', etb: 'etb', blink: 'blink',
      equipment: 'equipment', aura: 'auras', lifegain: 'lifegain',
      spellslinger: 'spells', spells: 'spells', artifact: 'artifacts',
      enchantment: 'enchantments', landfall: 'landfall',
      voltron: 'equipment', reanimator: 'graveyard',
      aristocrats: 'sacrifice', treasure: 'treasure',
    };
    for (const [key, group] of Object.entries(mechMap)) {
      if (tag.includes(key)) profile.mechanics.add(group);
    }
  }

  // Actualizar señales booleanas con lo añadido por Tagger
  profile.careAboutTokens       = profile.mechanics.has('tokens');
  profile.careAboutCounters     = profile.mechanics.has('counters');
  profile.careAboutGraveyard    = profile.mechanics.has('graveyard');
  profile.careAboutSacrifice    = profile.mechanics.has('sacrifice');
  profile.careAboutETB          = profile.mechanics.has('etb') || profile.mechanics.has('blink');
  profile.careAboutArtifacts    = profile.mechanics.has('artifacts') || profile.mechanics.has('treasure');
  profile.careAboutEnchantments = profile.mechanics.has('enchantments');
  profile.careAboutLandfall     = profile.mechanics.has('landfall');
  profile.careAboutLifegain     = profile.mechanics.has('lifegain');
  profile.careAboutSpells       = profile.mechanics.has('spells');
  profile.careAboutEquipment    = profile.mechanics.has('equipment') || profile.mechanics.has('auras');

  return profile;
}

async function fetchEdhrecData(commanderName) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://localhost:8000/api/commander/${encodeURIComponent(commanderName)}`, { signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// ---------- RENDER ----------
const ROLE_META = {
  'land':         { label: 'Tierras',           color: '#4ade80', icon: '🌲' },
  'ramp':         { label: 'Ramp',               color: '#facc15', icon: '⚡' },
  'draw':         { label: 'Robo de cartas',     color: '#60a5fa', icon: '📖' },
  'removal':      { label: 'Removal',            color: '#f87171', icon: '⚔️' },
  'wipe':         { label: 'Limpiamesas',        color: '#c084fc', icon: '💥' },
  'tutor':        { label: 'Tutores',            color: '#fb923c', icon: '🔍' },
  'protection':   { label: 'Protección',         color: '#34d399', icon: '🛡️' },
  'recursion':    { label: 'Recursión',          color: '#a78bfa', icon: '♻️' },
  'flex synergy': { label: 'Sinergia / Flex',    color: '#e2e8f0', icon: '✨' },
};

function createBadge(text, cls) {
  const b = document.createElement('span');
  b.textContent = text; b.className = `badge ${cls}`;
  return b;
}

function renderRecommendations(deck, collectionCounts, scoringContext, availableNorms) {
  const list = document.getElementById('recommendations');
  list.replaceChildren();

  const groups   = new Map();
  const roleOrder = ['land','ramp','draw','removal','wipe','tutor','protection','recursion','flex synergy'];

  for (const card of deck) {
    let role = card._assignedRole || 'flex synergy';
    if (role === 'flex fallback' || role === 'flex') role = 'flex synergy';
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(card);
  }

  for (const role of roleOrder) {
    const cards = groups.get(role);
    if (!cards?.length) continue;
    const meta = ROLE_META[role] || ROLE_META['flex synergy'];

    // Cabecera de categoría
    const header = document.createElement('li');
    header.className = 'category-header';
    header.style.setProperty('--cat-color', meta.color);
    header.innerHTML =
      `<span class="cat-icon">${meta.icon}</span>` +
      `<span class="cat-label">${meta.label}</span>` +
      `<span class="cat-count">${cards.length} cartas</span>`;
    list.appendChild(header);

    for (const card of cards) {
      const owned = collectionCounts.has(normalizeCardName(card.name));
      const finalScore = computeCardScore({ card, collectionCounts, availableNorms, ...scoringContext });

      const item = document.createElement('li');
      item.className = 'card-item';
      item.style.setProperty('--cat-color', meta.color);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'card-name';
      nameSpan.textContent = card.name;

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'card-score';
      scoreSpan.textContent = `${Math.round(finalScore)} pts`;

      const right = document.createElement('span');
      right.className = 'card-right';
      right.appendChild(scoreSpan);
      right.appendChild(createBadge(owned ? 'En colección' : 'Falta', owned ? 'badge-owned' : 'badge-missing'));

      item.appendChild(nameSpan);
      item.appendChild(right);

      // Tooltip: hover sobre el elemento
      if (getCardImageUrl(card)) {
        item.addEventListener('mouseenter', () => showTooltip(card));
        item.addEventListener('mouseleave', hideTooltip);
      }

      list.appendChild(item);
    }
  }
  return deck;
}

// ---------- DECK BUILDER ----------
// Reserva un porcentaje de tierras para básicas según colores del comandante
function buildDeckWithBasics(orderedNonLands, orderedLands, basicLands, plantillas, collectionCounts, maxPriceLimit) {
  const deck   = [];
  const slots  = { land:0, ramp:0, draw:0, wipe:0, removal:0, tutor:0, protection:0, recursion:0, flex:0 };
  const explicit = plantillas.land + plantillas.ramp + plantillas.draw + plantillas.wipe
                 + plantillas.removal + plantillas.tutor + plantillas.protection + plantillas.recursion;
  slots.flexMax = Math.max(0, 99 - explicit);

  let cost = 0, cmcSum = 0, nonLandCount = 0;

  // Cuántas tierras básicas incluir: ~30-40% del cupo de tierras, mínimo 3 por color
  const numColors  = (plantillas._colors || []).length || 1;
  const basicSlots = Math.max(numColors * 3, Math.floor(plantillas.land * 0.30));
  const nonBasicSlots = plantillas.land - basicSlots;

  // 1. Tierras no-básicas (hasta nonBasicSlots)
  for (const card of orderedLands) {
    if (slots.land >= nonBasicSlots) break;
    const isOwned   = collectionCounts.has(normalizeCardName(card.name));
    const addedCost = isOwned ? 0 : parseFloat(card.prices?.usd || 0);
    if (plantillas.maxBudget > 0 && cost + addedCost > plantillas.maxBudget) continue;
    if (plantillas.maxBudget > 0 && addedCost > maxPriceLimit) continue;
    card._assignedRole = 'land';
    deck.push(card);
    slots.land++;
    cost += addedCost;
  }

  // 2. Tierras básicas (repartidas por color)
  if (basicLands.length > 0) {
    const perColor = Math.floor(basicSlots / basicLands.length);
    let   extra    = basicSlots % basicLands.length;
    for (const basic of basicLands) {
      const qty = perColor + (extra-- > 0 ? 1 : 0);
      for (let i = 0; i < qty && slots.land < plantillas.land; i++) {
        const copy = { ...basic, _assignedRole: 'land' };
        deck.push(copy);
        slots.land++;
      }
    }
  } else {
    // Fallback: placeholder si no se pudieron fetchear básicas
    while (slots.land < plantillas.land && deck.length < 99) {
      deck.push({ name: 'Tierra Básica', type_line: 'Basic Land', _assignedRole: 'land', prices: { usd: '0' }, cmc: 0 });
      slots.land++;
    }
  }

  // 3. Cartas funcionales (ramp, draw, removal, etc.) y flex
  for (const card of orderedNonLands) {
    if (deck.length >= 99) break;
    const isOwned   = collectionCounts.has(normalizeCardName(card.name));
    const addedCost = isOwned ? 0 : parseFloat(card.prices?.usd || 0);
    if (plantillas.maxBudget > 0 && cost + addedCost > plantillas.maxBudget) continue;
    if (plantillas.maxBudget > 0 && addedCost > maxPriceLimit) continue;

    const tags = getCardTags(card);
    let assigned = false;

    for (const role of ['wipe','removal','draw','ramp','tutor','protection','recursion']) {
      if (tags.includes(role) && slots[role] < plantillas[role]) {
        slots[role]++;
        card._assignedRole = role;
        deck.push(card);
        assigned = true;
        break;
      }
    }
    if (!assigned && slots.flex < slots.flexMax) {
      slots.flex++;
      card._assignedRole = 'flex synergy';
      deck.push(card);
      assigned = true;
    }
    if (assigned) { cost += addedCost; cmcSum += card.cmc || 0; nonLandCount++; }
  }

  // 4. Fallback: si aún faltan cartas no-tierra, segunda pasada sin límite por carta
  //    pero respetando el presupuesto total. Nunca rellenamos huecos de hechizos con tierras.
  if (deck.length < 99) {
    for (const card of orderedNonLands) {
      if (deck.length >= 99) break;
      if (deck.includes(card)) continue;
      const isOwned   = collectionCounts.has(normalizeCardName(card.name));
      const addedCost = isOwned ? 0 : parseFloat(card.prices?.usd || 0);
      if (plantillas.maxBudget > 0 && cost + addedCost > plantillas.maxBudget) continue;
      card._assignedRole = 'flex synergy';
      deck.push(card);
      cost += addedCost; cmcSum += card.cmc || 0; nonLandCount++;
    }
  }

  return {
    cards: deck,
    stats: { cost, avgCmc: nonLandCount > 0 ? cmcSum / nonLandCount : 0 }
  };
}

function buildDeckPorPlantilla(orderedNonLands, orderedLands, basicLands, plantillas, collectionCounts) {
  if (plantillas.maxBudget <= 0)
    return buildDeckWithBasics(orderedNonLands, orderedLands, basicLands, plantillas, collectionCounts, Infinity);

  let best = null;
  let maxPrice = Math.max(plantillas.maxBudget * 0.20, 2.0);
  for (let i = 0; i < 6; i++) {
    const r = buildDeckWithBasics(orderedNonLands, orderedLands, basicLands, plantillas, collectionCounts, maxPrice);
    if (!best || r.cards.length > best.cards.length) best = r;
    if (r.cards.length === 99) break;
    maxPrice *= 0.5;
  }
  return best;
}

function updateText(id, text) { document.getElementById(id).textContent = text; }

// ---------- SUBMIT ----------
async function handleSubmit(event) {
  event.preventDefault();
  const submitBtn = document.getElementById('submit-btn');
  const form      = event.currentTarget;
  const commanderName = form.commander.value.trim();
  if (!commanderName) { updateText('status', 'Debes indicar un comandante.'); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Generando...';
  document.body.classList.add('loading');
  updateText('status', 'Buscando comandante...');
  updateText('summary', '');
  document.getElementById('recommendations').replaceChildren();

  const collectionCounts = parseCollection(form.collection.value);

  try {
    // 1. Datos del comandante
    const commander = await fetchCommander(commanderName);
    updateText('status', `Comandante: ${commander.name}. Analizando perfil y buscando cartas...`);

    // 2. Perfil del comandante
    const commanderProfile = await buildCommanderProfile(commander);

    // 3. Candidatos y tierras básicas
    const [candidates, basicLands] = await Promise.all([
      fetchCandidates(commander.color_identity || [], commanderProfile),
      fetchBasicLands(commander.color_identity || []),
    ]);

    // Debug en consola
    console.log('[perfil] Tribus:', [...commanderProfile.tribes].join(', ') || 'ninguna');
    console.log('[perfil] Mecánicas:', [...commanderProfile.mechanics].join(', ') || 'ninguna');

    updateText('status',
      `Perfil — Tribus: ${[...commanderProfile.tribes].join(', ') || 'ninguna'} | Mecánicas: ${[...commanderProfile.mechanics].join(', ') || 'ninguna'} | ${candidates.length} candidatas encontradas. Calculando...`
    );

    const plantillas = {
      land:       parseInt(form.lands.value)      || 36,
      ramp:       parseInt(form.ramp.value)        || 10,
      draw:       parseInt(form.draw.value)        || 10,
      removal:    parseInt(form.removal.value)     || 8,
      wipe:       parseInt(form.wipe.value)        || 3,
      tutor:      parseInt(form.tutor.value)       || 2,
      recursion:  parseInt(form.recursion.value)   || 3,
      protection: parseInt(form.protection.value)  || 5,
      maxBudget:  parseFloat(form.budget.value)    || 0,
      _colors:    commander.color_identity || [],
    };

    // 3. Separar tierras del resto (el builder las maneja aparte)
    const withoutCommander = candidates.filter(c => c.name !== commander.name);
    const landCandidates   = withoutCommander.filter(c => (c.type_line || '').toLowerCase().includes('land'));
    const nonLandCandidates = withoutCommander.filter(c => !(c.type_line || '').toLowerCase().includes('land'));

    // 4. EDHREC (opcional)
    const edhrecData = await fetchEdhrecData(commander.name);
    const theme      = form.theme.value;
    let commanderSynergyMap = new Map();
    let cooccurrenceMap     = new Map();
    if (edhrecData?.cardlist) {
      commanderSynergyMap = buildCommanderSynergyMap(edhrecData.cardlist);
      cooccurrenceMap     = buildCooccurrenceMap(edhrecData.cardlist);
    }

    // 5. Ordenar tierras por relevancia de perfil
    const availableNormsAll = new Set(withoutCommander.map(c => normalizeCardName(c.name)));
    const orderedLands = [...landCandidates].sort((a, b) =>
      computeCardScore({ card: b, collectionCounts, commanderProfile, commanderSynergyMap, deckSynergyMap: new Map(), cooccurrenceMap, theme, availableNorms: availableNormsAll })
      - computeCardScore({ card: a, collectionCounts, commanderProfile, commanderSynergyMap, deckSynergyMap: new Map(), cooccurrenceMap, theme, availableNorms: availableNormsAll })
    );

    // 6. Ordenar no-tierras con el algoritmo iterativo
    const orderedNonLands = sortByScoreIterative({
      cards: nonLandCandidates,
      collectionCounts,
      commanderProfile,
      commanderSynergyMap,
      cooccurrenceMap,
      theme,
      commander,
      iterations: 3,
      topN: 120,
    });

    // 7. Construir mazo
    const deckData = buildDeckPorPlantilla(orderedNonLands, orderedLands, basicLands, plantillas, collectionCounts);

    // 8. Render
    const scoringContext = {
      commanderProfile,
      commanderSynergyMap,
      deckSynergyMap: computeDeckSynergyMap(withoutCommander, [commander, ...orderedNonLands.slice(0, 99)]),
      cooccurrenceMap,
      theme,
    };
    const chosen = renderRecommendations(deckData.cards, collectionCounts, scoringContext, availableNormsAll);

    const owned = chosen.filter(c => collectionCounts.has(normalizeCardName(c.name))).length;
    const note  = chosen.length < 99 ? ` · Aviso: solo ${chosen.length} cartas.` : '';

    updateText('status', `Comandante: ${commander.name}`);
    updateText('summary',
      `${chosen.length} cartas · ${owned} en colección · Inversión: $${deckData.stats.cost.toFixed(2)} · CMC medio: ${deckData.stats.avgCmc.toFixed(2)}${note}`
    );
  } catch (error) {
    console.error('[v0]', error);
    updateText('status', `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Generar Mazo';
    document.body.classList.remove('loading');
  }
}

if (typeof document !== 'undefined') {
  const form = document.getElementById('deck-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
    console.log("[v0] Event listener attached");
  } else {
    console.error("[v0] ERROR: deck-form not found!");
  }
}