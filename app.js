const SCRYFALL_BASE = 'https://api.scryfall.com';

function normalizeCardName(name) {
  return name.trim().toLowerCase();
}

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

export function sortRecommendations(cards, collectionCounts) {
  return [...cards].sort((a, b) => {
    const aOwned = collectionCounts.has(normalizeCardName(a.name)) ? 1 : 0;
    const bOwned = collectionCounts.has(normalizeCardName(b.name)) ? 1 : 0;

    if (aOwned !== bOwned) return bOwned - aOwned;

    const aRank = Number.isFinite(a.edhrec_rank) ? a.edhrec_rank : Number.MAX_SAFE_INTEGER;
    const bRank = Number.isFinite(b.edhrec_rank) ? b.edhrec_rank : Number.MAX_SAFE_INTEGER;

    if (aRank !== bRank) return aRank - bRank;

    return a.name.localeCompare(b.name);
  });
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
  const url = `${SCRYFALL_BASE}/cards/search?q=${encodeURIComponent(query)}&order=edhrec&dir=asc`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.details || 'No se pudieron obtener sugerencias desde Scryfall.');
  }

  return data.data.filter((card) => card.layout !== 'art_series');
}

function createBadge(text, className) {
  const badge = document.createElement('span');
  badge.textContent = text;
  badge.className = `badge ${className}`;
  return badge;
}

function renderRecommendations(recommendations, collectionCounts) {
  const list = document.getElementById('recommendations');
  list.replaceChildren();

  const selected = recommendations.slice(0, 99);
  for (const card of selected) {
    const item = document.createElement('li');
    item.textContent = card.name;

    const owned = collectionCounts.has(normalizeCardName(card.name));
    item.appendChild(createBadge(owned ? 'En colección' : 'Falta', owned ? 'badge-owned' : 'badge-missing'));
    list.appendChild(item);
  }

  return selected;
}

function updateText(id, text) {
  const node = document.getElementById(id);
  node.textContent = text;
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
    const commander = await fetchCommander(commanderName);
    const candidates = await fetchCandidates(commander.color_identity || []);
    const withoutCommander = candidates.filter((card) => card.name !== commander.name);
    const ordered = sortRecommendations(withoutCommander, collectionCounts);
    const chosen = renderRecommendations(ordered, collectionCounts);

    const owned = chosen.filter((card) => collectionCounts.has(normalizeCardName(card.name))).length;
    const missing = chosen.length - owned;

    updateText('status', `Comandante: ${commander.name}`);
    updateText('summary', `Sugerencias: ${chosen.length} cartas. Priorizadas por colección: ${owned} en colección, ${missing} faltantes.`);
  } catch (error) {
    updateText('status', `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
  }
}

if (typeof document !== 'undefined') {
  document.getElementById('deck-form').addEventListener('submit', handleSubmit);
}
