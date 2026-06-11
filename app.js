console.log("app.js starting to load...");

import {
  buildConsistentNonLandDeck,
  improveDeckWithSwaps,
  scoreWholeDeck,
  buildCommanderSynergyMap,
  buildCooccurrenceMap,
  computeDeckSynergyMap,
  normalizeCardName,
  computeCardScore,
  analyzeCommander,
} from "./scoring.js";

const SCRYFALL_BASE = "https://api.scryfall.com";

let lastGeneratedDeck = null;
let lastGeneratedCommander = null;

// ---------- TOOLTIP ----------
let tooltip = null;
let tooltipImg = null;

if (typeof document !== "undefined") {
  tooltip = document.createElement("div");
  tooltip.id = "card-tooltip";

  tooltipImg = document.createElement("img");
  tooltipImg.id = "card-tooltip-img";
  tooltipImg.alt = "";

  tooltip.appendChild(tooltipImg);
  document.body.appendChild(tooltip);
}

function getCardImageUrl(card) {
  if (!card) {
    return null;
  }

  if (card.image_uris?.normal) {
    return card.image_uris.normal;
  }

  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal;
  }

  return null;
}

function showTooltip(card) {
  const url = getCardImageUrl(card);

  if (!url || !tooltip || !tooltipImg) {
    return;
  }

  tooltipImg.src = url;
  tooltip.classList.add("visible");
}

function moveTooltip(event) {
  if (!tooltip) {
    return;
  }

  const padding = 18;
  const tooltipWidth = 234;
  const tooltipHeight = 326;

  let x = event.clientX + padding;
  let y =
    event.clientY -
    Math.round(tooltipHeight / 2);

  if (
    x + tooltipWidth >
    window.innerWidth
  ) {
    x =
      event.clientX -
      tooltipWidth -
      padding;
  }

  if (y < 4) {
    y = 4;
  }

  if (
    y + tooltipHeight >
    window.innerHeight - 4
  ) {
    y =
      window.innerHeight -
      tooltipHeight -
      4;
  }

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideTooltip() {
  if (!tooltip) {
    return;
  }

  tooltip.classList.remove("visible");
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "mousemove",
    moveTooltip
  );
}

// ---------- COLECCIÓN ----------
export function parseCollection(input) {
  const counts = new Map();

  for (const rawLine of input.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const match = line.match(
      /^(\d+)\s*x?\s+(.+)$/i
    );

    const quantity = match
      ? Number.parseInt(match[1], 10)
      : 1;

    const name = match
      ? match[2]
      : line;

    const canonicalName = name
      .trim()
      .toLowerCase();

    const normalizedName =
      normalizeCardName(name);

    if (!canonicalName) {
      continue;
    }

    const validQuantity = Math.max(
      quantity,
      1
    );

    counts.set(
      canonicalName,
      (counts.get(canonicalName) ?? 0) +
        validQuantity
    );

    counts.set(
      normalizedName,
      (counts.get(normalizedName) ?? 0) +
        validQuantity
    );
  }

  return counts;
}

export function sortRecommendations(
  cards,
  collection
) {
  const normalizedName = card =>
    normalizeCardName(card.name);

  const canonicalName = card =>
    (card.name || "")
      .trim()
      .toLowerCase();

  return [...cards].sort(
    (cardA, cardB) => {
      const cardAOwned =
        collection &&
        (
          collection.has(
            normalizedName(cardA)
          ) ||
          collection.has(
            canonicalName(cardA)
          )
        )
          ? 0
          : 1;

      const cardBOwned =
        collection &&
        (
          collection.has(
            normalizedName(cardB)
          ) ||
          collection.has(
            canonicalName(cardB)
          )
        )
          ? 0
          : 1;

      if (cardAOwned !== cardBOwned) {
        return cardAOwned - cardBOwned;
      }

      const cardARank =
        Number.isFinite(
          cardA.edhrec_rank
        )
          ? cardA.edhrec_rank
          : Number.MAX_SAFE_INTEGER;

      const cardBRank =
        Number.isFinite(
          cardB.edhrec_rank
        )
          ? cardB.edhrec_rank
          : Number.MAX_SAFE_INTEGER;

      return cardARank - cardBRank;
    }
  );
}

// ---------- SCRYFALL ----------
async function fetchCommander(
  commanderName
) {
  const response = await fetch(
    `${SCRYFALL_BASE}/cards/named?exact=${encodeURIComponent(
      commanderName
    )}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.details ||
        "No se pudo encontrar el comandante."
    );
  }

  if (
    !data.legalities ||
    data.legalities.commander !== "legal"
  ) {
    throw new Error(
      "La carta indicada no es legal como comandante en Commander."
    );
  }

  return data;
}

async function fetchCandidates(
  colorIdentity,
  commanderProfile
) {
  const identity =
    colorIdentity.length > 0
      ? colorIdentity.join("")
      : "c";

  const baseQuery =
    "format:commander game:paper " +
    "unique:cards -type:basic " +
    `identity<=${identity}`;

  const extraFilters = [];

  if (commanderProfile) {
    if (
      commanderProfile.tribes.has(
        "ally"
      )
    ) {
      extraFilters.push("o:ally");
    }

    const tribeTerms = [
      ...commanderProfile.tribes
    ]
      .filter(
        tribe =>
          tribe &&
          tribe !== "ally"
      )
      .slice(0, 3);

    for (const tribe of tribeTerms) {
      extraFilters.push(
        `(o:${tribe} OR type:${tribe})`
      );
    }

    if (
      commanderProfile.mechanics.has(
        "tokens"
      )
    ) {
      extraFilters.push(
        '(o:token OR o:"create token")'
      );
    }

    if (
      commanderProfile.mechanics.has(
        "graveyard"
      )
    ) {
      extraFilters.push(
        "(o:graveyard OR o:reanimate " +
          "OR o:flashback OR o:unearth)"
      );
    }

    if (
      commanderProfile.mechanics.has(
        "spells"
      )
    ) {
      extraFilters.push(
        "(o:instant OR o:sorcery " +
          'OR o:"copy target spell" ' +
          "OR o:magecraft " +
          "OR o:spellslinger)"
      );
    }

    if (
      commanderProfile.mechanics.has(
        "equipment"
      )
    ) {
      extraFilters.push(
        "(type:equipment " +
          "OR o:equip " +
          "OR o:equipment)"
      );
    }

    if (
      commanderProfile.mechanics.has(
        "landfall"
      )
    ) {
      extraFilters.push("o:landfall");
    }
  }

  const queries = [baseQuery];

  if (extraFilters.length > 0) {
    queries.push(
      `${baseQuery} ${extraFilters.join(
        " "
      )}`
    );
  }

  const cards = [];
  const cardIds = new Set();

  for (
    let queryIndex = 0;
    queryIndex < queries.length;
    queryIndex++
  ) {
    let url =
      `${SCRYFALL_BASE}/cards/search?` +
      `q=${encodeURIComponent(
        queries[queryIndex]
      )}` +
      "&order=edhrec&dir=asc";

    const pageLimit =
      queryIndex === 0 ? 3 : 2;

    for (
      let pageIndex = 0;
      pageIndex < pageLimit;
      pageIndex++
    ) {
      if (!url) {
        break;
      }

      const response =
        await fetch(url);

      const data =
        await response.json();

      if (!response.ok) {
        if (cards.length > 0) {
          break;
        }

        throw new Error(
          data?.details ||
            "Error en Scryfall."
        );
      }

      for (
        const card of data.data.filter(
          candidate =>
            candidate.layout !==
            "art_series"
        )
      ) {
        if (!cardIds.has(card.id)) {
          cardIds.add(card.id);
          cards.push(card);
        }
      }

      url = data.has_more
        ? data.next_page
        : null;

      if (url) {
        await new Promise(resolve =>
          setTimeout(resolve, 60)
        );
      }
    }
  }

  return cards;
}

// ---------- TIERRAS BÁSICAS ----------
const COLOR_TO_BASIC = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest"
};

async function fetchBasicLands(
  colorIdentity
) {
  const basicLands = [];

  const colors =
    colorIdentity.length > 0
      ? colorIdentity
      : ["W"];

  for (const color of colors) {
    const basicLandName =
      COLOR_TO_BASIC[color];

    if (!basicLandName) {
      continue;
    }

    try {
      const response = await fetch(
        `${SCRYFALL_BASE}/cards/named?` +
          `exact=${encodeURIComponent(
            basicLandName
          )}`
      );

      const data =
        await response.json();

      if (response.ok) {
        data._isBasicLand = true;
        data._basicColor = color;

        basicLands.push(data);
      }
    } catch {
      // Se ignoran errores individuales.
    }
  }

  return basicLands;
}

// ---------- TAGGER ----------
async function fetchTaggerTags(
  scryfallId
) {
  try {
    const controller =
      new AbortController();

    const timeoutId = setTimeout(
      () => controller.abort(),
      3000
    );

    const response = await fetch(
      `${SCRYFALL_BASE}/cards/${scryfallId}/tagger-tags`,
      {
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const data =
      await response.json();

    return (data.data || [])
      .map(
        tagData =>
          tagData.tag?.toLowerCase?.() ||
          ""
      )
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function buildCommanderProfile(
  commander
) {
  const profile =
    analyzeCommander(commander);

  const tags =
    await fetchTaggerTags(
      commander.id
    );

  for (const tag of tags) {
    if (
      tag.startsWith(
        "creature-type-"
      )
    ) {
      profile.tribes.add(
        tag
          .replace(
            "creature-type-",
            ""
          )
          .replace(/-/g, " ")
      );

      profile.careAboutCreatureType =
        true;
    }

    const mechanicMap = {
      token: "tokens",
      counter: "counters",
      graveyard: "graveyard",
      sacrifice: "sacrifice",
      etb: "etb",
      blink: "blink",
      equipment: "equipment",
      aura: "auras",
      lifegain: "lifegain",
      spellslinger: "spells",
      spells: "spells",
      artifact: "artifacts",
      enchantment: "enchantments",
      landfall: "landfall",
      voltron: "equipment",
      reanimator: "graveyard",
      aristocrats: "sacrifice",
      treasure: "treasure"
    };

    for (
      const [key, group]
      of Object.entries(
        mechanicMap
      )
    ) {
      if (tag.includes(key)) {
        profile.mechanics.add(group);
      }
    }
  }

  profile.careAboutTokens =
    profile.mechanics.has("tokens");

  profile.careAboutCounters =
    profile.mechanics.has(
      "counters"
    );

  profile.careAboutGraveyard =
    profile.mechanics.has(
      "graveyard"
    );

  profile.careAboutSacrifice =
    profile.mechanics.has(
      "sacrifice"
    );

  profile.careAboutETB =
    profile.mechanics.has("etb") ||
    profile.mechanics.has("blink");

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
    profile.mechanics.has(
      "landfall"
    );

  profile.careAboutLifegain =
    profile.mechanics.has(
      "lifegain"
    );

  profile.careAboutSpells =
    profile.mechanics.has("spells");

  profile.careAboutEquipment =
    profile.mechanics.has(
      "equipment"
    ) ||
    profile.mechanics.has("auras");

  return profile;
}

// ---------- EDHREC LOCAL ----------
async function fetchEdhrecData(
  commanderName
) {
  try {
    const controller =
      new AbortController();

    const timeoutId = setTimeout(
      () => controller.abort(),
      2000
    );

    const response = await fetch(
      "http://localhost:8000/api/commander/" +
        encodeURIComponent(
          commanderName
        ),
      {
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

function compareWithAverageDeck({
  generatedDeck,
  averageDeck
}) {
  if (
    !Array.isArray(averageDeck) ||
    averageDeck.length < 20
  ) {
    return null;
  }

  const generatedNames = new Set(
    generatedDeck.map(card =>
      normalizeCardName(card.name)
    )
  );

  const averageNames = new Set(
    averageDeck.map(card =>
      normalizeCardName(card.name)
    )
  );

  const shared = averageDeck.filter(card =>
    generatedNames.has(
      normalizeCardName(card.name)
    )
  );

  const missingPopular = averageDeck.filter(card =>
    !generatedNames.has(
      normalizeCardName(card.name)
    )
  );

  const unusualPicks = generatedDeck.filter(card =>
    !averageNames.has(
      normalizeCardName(card.name)
    )
  );

  return {
    shared,
    missingPopular,
    unusualPicks,
    overlapRatio:
      shared.length / averageDeck.length
  };
}

function formatEdhrecComparisonSummary(comparison) {
  if (!comparison) {
    return "";
  }

  const percentage = Math.round(
    comparison.overlapRatio * 100
  );

  return (
    ` · EDHREC: ${comparison.shared.length} comunes` +
    ` (${percentage}%)`
  );
}

// ---------- RENDER ----------
const ROLE_META = {
  land: {
    label: "Tierras",
    color: "#4ade80",
    icon: "🌲"
  },

  ramp: {
    label: "Ramp",
    color: "#facc15",
    icon: "⚡"
  },

  draw: {
    label: "Robo de cartas",
    color: "#60a5fa",
    icon: "📖"
  },

  removal: {
    label: "Removal",
    color: "#f87171",
    icon: "⚔️"
  },

  wipe: {
    label: "Limpiamesas",
    color: "#c084fc",
    icon: "💥"
  },

  tutor: {
    label: "Tutores",
    color: "#fb923c",
    icon: "🔍"
  },

  protection: {
    label: "Protección",
    color: "#34d399",
    icon: "🛡️"
  },

  recursion: {
    label: "Recursión",
    color: "#a78bfa",
    icon: "♻️"
  },

  "flex synergy": {
    label: "Sinergia / Flex",
    color: "#e2e8f0",
    icon: "✨"
  }
};

function createBadge(
  text,
  className
) {
  const badge =
    document.createElement("span");

  badge.textContent = text;
  badge.className =
    `badge ${className}`;

  return badge;
}

function renderRecommendations(
  deck,
  collectionCounts,
  scoringContext,
  availableNorms
) {
  const list =
    document.getElementById(
      "recommendations"
    );

  list.replaceChildren();

  const groups = new Map();

  const roleOrder = [
    "land",
    "ramp",
    "draw",
    "removal",
    "wipe",
    "tutor",
    "protection",
    "recursion",
    "flex synergy"
  ];

  for (const card of deck) {
    let role =
      card._assignedRole ||
      "flex synergy";

    if (
      role === "flex fallback" ||
      role === "flex"
    ) {
      role = "flex synergy";
    }

    if (!groups.has(role)) {
      groups.set(role, []);
    }

    groups.get(role).push(card);
  }

  for (const role of roleOrder) {
    const cards = groups.get(role);

    if (!cards?.length) {
      continue;
    }

    const meta =
      ROLE_META[role] ||
      ROLE_META["flex synergy"];

    const header =
      document.createElement("li");

    header.className =
      "category-header";

    header.style.setProperty(
      "--cat-color",
      meta.color
    );

    header.innerHTML =
      `<span class="cat-icon">` +
      `${meta.icon}</span>` +
      `<span class="cat-label">` +
      `${meta.label}</span>` +
      `<span class="cat-count">` +
      `${cards.length} cartas</span>`;

    list.appendChild(header);

    for (const card of cards) {
      const owned =
        collectionCounts.has(
          normalizeCardName(
            card.name
          )
        );

      const finalScore =
        computeCardScore({
          card,
          collectionCounts,
          availableNorms,
          ...scoringContext
        });

      const item =
        document.createElement("li");

      item.className = "card-item";

      item.style.setProperty(
        "--cat-color",
        meta.color
      );

      const nameSpan =
        document.createElement(
          "span"
        );

      nameSpan.className =
        "card-name";

      nameSpan.textContent =
        card.name;

      const scoreSpan =
        document.createElement(
          "span"
        );

      scoreSpan.className =
        "card-score";

      scoreSpan.textContent =
        `${Math.round(
          finalScore
        )} pts`;

      const right =
        document.createElement(
          "span"
        );

      right.className =
        "card-right";

      right.appendChild(
        scoreSpan
      );

      right.appendChild(
        createBadge(
          owned
            ? "En colección"
            : "Falta",
          owned
            ? "badge-owned"
            : "badge-missing"
        )
      );

      item.appendChild(nameSpan);
      item.appendChild(right);

      if (getCardImageUrl(card)) {
        item.addEventListener(
          "mouseenter",
          () => showTooltip(card)
        );

        item.addEventListener(
          "mouseleave",
          hideTooltip
        );
      }

      list.appendChild(item);
    }
  }

  return deck;
}

// ---------- CONSTRUCCIÓN DE TIERRAS ----------
function chooseLandPackage(
  orderedLands,
  basicLands,
  templates,
  collectionCounts,
  maxPriceLimit
) {
  const selectedLands = [];
  let cost = 0;

  const colorCount =
    (templates._colors || [])
      .length || 1;

  const basicLandSlots = Math.min(
    templates.land,
    Math.max(
      colorCount * 3,
      Math.floor(
        templates.land * 0.3
      )
    )
  );

  const nonBasicLandSlots =
    Math.max(
      0,
      templates.land -
        basicLandSlots
    );

  for (
    const originalCard
    of orderedLands
  ) {
    if (
      selectedLands.length >=
      nonBasicLandSlots
    ) {
      break;
    }

    const normalizedName =
      normalizeCardName(
        originalCard.name
      );

    const price =
      collectionCounts.has(
        normalizedName
      )
        ? 0
        : Number.parseFloat(
            originalCard.prices
              ?.usd || "0"
          ) || 0;

    if (price > maxPriceLimit) {
      continue;
    }

    if (
      templates.maxBudget > 0 &&
      cost + price >
        templates.maxBudget
    ) {
      continue;
    }

    selectedLands.push({
      ...originalCard,
      _assignedRole: "land"
    });

    cost += price;
  }

  if (basicLands.length > 0) {
    let basicIndex = 0;

    while (
      selectedLands.length <
      templates.land
    ) {
      const basicLand =
        basicLands[
          basicIndex %
            basicLands.length
        ];

      selectedLands.push({
        ...basicLand,
        _assignedRole: "land"
      });

      basicIndex++;
    }
  } else {
    while (
      selectedLands.length <
      templates.land
    ) {
      selectedLands.push({
        name: "Basic Land",
        type_line: "Basic Land",
        oracle_text: "",
        mana_cost: "",
        cmc: 0,
        prices: {
          usd: "0"
        },
        _assignedRole: "land"
      });
    }
  }

  return {
    cards: selectedLands,
    cost
  };
}

// ---------- CONSTRUCTOR DE MAZO ----------
function buildDeckByTemplate({
  nonLandCandidates,
  orderedLands,
  basicLands,
  templates,
  collectionCounts,
  scoring
}) {
  const nonLandTarget =
    Math.max(
      0,
      99 - templates.land
    );

  const attemptCount =
    templates.maxBudget > 0
      ? 6
      : 1;

  let maxPriceLimit =
    templates.maxBudget > 0
      ? Math.max(
          templates.maxBudget *
            0.2,
          2
        )
      : Infinity;

  let bestResult = null;

  for (
    let attempt = 0;
    attempt < attemptCount;
    attempt++
  ) {
    const landPackage =
      chooseLandPackage(
        orderedLands,
        basicLands,
        templates,
        collectionCounts,
        maxPriceLimit
      );

    const nonLandPackage =
      buildConsistentNonLandDeck({
        cards: nonLandCandidates,
        targetCount:
          nonLandTarget,
        roleTargets: templates,
        collectionCounts,
        commanderProfile:
          scoring.commanderProfile,
        commanderSynergyMap:
          scoring.commanderSynergyMap,
        cooccurrenceMap:
          scoring.cooccurrenceMap,
        theme: scoring.theme,
        commander:
          scoring.commander,
        maxBudget:
          templates.maxBudget,
        startingCost:
          landPackage.cost,
        maxPriceLimit
      });

    const cards = [
      ...landPackage.cards,
      ...nonLandPackage.cards
    ];

    const totalCmc =
      nonLandPackage.cards.reduce(
        (sum, card) =>
          sum +
          (Number(card.cmc) || 0),
        0
      );

    const result = {
      cards,

      stats: {
        cost:
          nonLandPackage.cost,

        avgCmc:
          nonLandPackage.cards.length >
          0
            ? totalCmc /
              nonLandPackage.cards
                .length
            : 0,

        roleCounts:
          nonLandPackage.roleCounts
      }
    };

    const isBetter =
      bestResult === null ||
      result.cards.length >
        bestResult.cards.length ||
      (
        result.cards.length ===
          bestResult.cards.length &&
        result.stats.cost <
          bestResult.stats.cost
      );

    if (isBetter) {
      bestResult = result;
    }

    if (cards.length === 99) {
      break;
    }

    maxPriceLimit *= 0.55;
  }

  return bestResult;
}

// ---------- EXPORTACIÓN ----------
export function formatDeckList(
  commander,
  cards
) {
  const counts = new Map();

  for (const card of cards) {
    const name =
      card.name ||
      "Carta sin nombre";

    counts.set(
      name,
      (counts.get(name) || 0) + 1
    );
  }

  const lines = [
    `1 ${commander.name}`,
    "",
    "// Mazo"
  ];

  const orderedEntries = [
    ...counts.entries()
  ].sort(
    (entryA, entryB) =>
      entryA[0].localeCompare(
        entryB[0]
      )
  );

  for (
    const [name, quantity]
    of orderedEntries
  ) {
    lines.push(
      `${quantity} ${name}`
    );
  }

  return lines.join("\n");
}

function exportCurrentDeck() {
  if (
    !lastGeneratedDeck ||
    !lastGeneratedCommander
  ) {
    return;
  }

  const content = formatDeckList(
    lastGeneratedCommander,
    lastGeneratedDeck
  );

  const blob = new Blob(
    [content],
    {
      type:
        "text/plain;charset=utf-8"
    }
  );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  const safeName =
    lastGeneratedCommander.name
      .replace(
        /[^a-z0-9]+/gi,
        "-"
      )
      .replace(
        /^-|-$/g,
        ""
      )
      .toLowerCase();

  link.href = url;

  link.download =
    `${safeName || "commander"}` +
    "-deck.txt";

  document.body.appendChild(link);

  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function updateText(id, text) {
  const element =
    document.getElementById(id);

  if (element) {
    element.textContent = text;
  }
}

function formatCoherenceScore(rawScore) {
  /*
   * scoreWholeDeck devuelve una puntuación interna,
   * no una nota pensada para mostrarse directamente.
   *
   * Esta conversión aproxima:
   * -40  => 0/100
   * 220  => 100/100
   */
  const normalized = Math.round(
    ((rawScore + 40) / 260) * 100
  );

  const clamped = Math.max(
    0,
    Math.min(100, normalized)
  );

  let label = "baja";

  if (clamped >= 75) {
    label = "alta";
  } else if (clamped >= 45) {
    label = "media";
  }

  return `${clamped}/100 (${label})`;
}

// ---------- FORMULARIO ----------
async function handleSubmit(event) {
  event.preventDefault();

  const submitButton =
    document.getElementById(
      "submit-btn"
    );

  const exportButton =
    document.getElementById(
      "export-btn"
    );

  const form =
    event.currentTarget;

  const commanderName =
    form.commander.value.trim();

  if (!commanderName) {
    updateText(
      "status",
      "Debes indicar un comandante."
    );

    return;
  }

  submitButton.disabled = true;
  submitButton.textContent =
    "Generando...";

  document.body.classList.add(
    "loading"
  );

  updateText(
    "status",
    "Buscando comandante..."
  );

  updateText("summary", "");

  document
    .getElementById(
      "recommendations"
    )
    .replaceChildren();

  if (exportButton) {
    exportButton.hidden = true;
  }

  lastGeneratedDeck = null;
  lastGeneratedCommander = null;

  const collectionCounts =
    parseCollection(
      form.collection.value
    );

  try {
    const commander =
      await fetchCommander(
        commanderName
      );

    updateText(
      "status",
      `Comandante: ${commander.name}. ` +
        "Analizando perfil y " +
        "buscando cartas..."
    );

    const commanderProfile =
      await buildCommanderProfile(
        commander
      );

    const [
      candidates,
      basicLands
    ] = await Promise.all([
      fetchCandidates(
        commander.color_identity ||
          [],
        commanderProfile
      ),

      fetchBasicLands(
        commander.color_identity ||
          []
      )
    ]);

    console.log(
      "[perfil] Tribus:",
      [
        ...commanderProfile.tribes
      ].join(", ") || "ninguna"
    );

    console.log(
      "[perfil] Mecánicas:",
      [
        ...commanderProfile
          .mechanics
      ].join(", ") || "ninguna"
    );

    updateText(
      "status",
      `Perfil — Tribus: ${
        [
          ...commanderProfile.tribes
        ].join(", ") || "ninguna"
      } | Mecánicas: ${
        [
          ...commanderProfile
            .mechanics
        ].join(", ") || "ninguna"
      } | ${candidates.length} ` +
        "candidatas encontradas. " +
        "Calculando..."
    );

    const templates = {
      land:
        Number.parseInt(
          form.lands.value,
          10
        ) || 38,

      ramp:
        Number.parseInt(
          form.ramp.value,
          10
        ) || 10,

      draw:
        Number.parseInt(
          form.draw.value,
          10
        ) || 10,

      removal:
        Number.parseInt(
          form.removal.value,
          10
        ) || 8,

      wipe:
        Number.parseInt(
          form.wipe.value,
          10
        ) || 3,

      tutor:
        Number.parseInt(
          form.tutor.value,
          10
        ) || 2,

      recursion:
        Number.parseInt(
          form.recursion.value,
          10
        ) || 3,

      protection:
        Number.parseInt(
          form.protection.value,
          10
        ) || 5,

      maxBudget:
        Number.parseFloat(
          form.budget.value
        ) || 0,

      _colors:
        commander.color_identity ||
        []
    };

    const withoutCommander =
      candidates.filter(
        card =>
          card.name !==
          commander.name
      );

    const landCandidates =
      withoutCommander.filter(
        card =>
          (
            card.type_line || ""
          )
            .toLowerCase()
            .includes("land")
      );

    const nonLandCandidates =
      withoutCommander.filter(
        card =>
          !(
            card.type_line || ""
          )
            .toLowerCase()
            .includes("land")
      );

    const edhrecData =
      await fetchEdhrecData(
        commander.name
      );

    const theme =
      form.theme.value;

    let commanderSynergyMap =
      new Map();

    let cooccurrenceMap =
      new Map();

    if (edhrecData?.cardlist) {
      commanderSynergyMap =
        buildCommanderSynergyMap(
          edhrecData.cardlist
        );

      cooccurrenceMap =
        buildCooccurrenceMap(
          edhrecData.cardlist
        );
    }

    const availableCandidateNames =
      new Set(
        withoutCommander.map(
          card =>
            normalizeCardName(
              card.name
            )
        )
      );

    const orderedLands = [
      ...landCandidates
    ].sort((cardA, cardB) => {
      const scoreB =
        computeCardScore({
          card: cardB,
          collectionCounts,
          commanderProfile,
          commanderSynergyMap,
          deckSynergyMap:
            new Map(),
          cooccurrenceMap,
          theme,
          availableNorms:
            availableCandidateNames
        });

      const scoreA =
        computeCardScore({
          card: cardA,
          collectionCounts,
          commanderProfile,
          commanderSynergyMap,
          deckSynergyMap:
            new Map(),
          cooccurrenceMap,
          theme,
          availableNorms:
            availableCandidateNames
        });

      return scoreB - scoreA;
    });

    const deckData =
      buildDeckByTemplate({
        nonLandCandidates,
        orderedLands,
        basicLands,
        templates,
        collectionCounts,

        scoring: {
          commanderProfile,
          commanderSynergyMap,
          cooccurrenceMap,
          theme,
          commander
        }
      });

    if (!deckData) {
      throw new Error(
        "No se pudo construir el mazo."
      );
    }

    // ---------- SWAPS GLOBALES ----------
    const lands =
      deckData.cards.filter(
        card =>
          (
            card.type_line || ""
          )
            .toLowerCase()
            .includes("land")
      );

    const nonLands =
      deckData.cards.filter(
        card =>
          !(
            card.type_line || ""
          )
            .toLowerCase()
            .includes("land")
      );

    const landCost =
      lands.reduce(
        (sum, card) => {
          const normalizedName =
            normalizeCardName(
              card.name
            );

          if (
            collectionCounts.has(
              normalizedName
            )
          ) {
            return sum;
          }

          return (
            sum +
            (
              Number.parseFloat(
                card.prices?.usd ||
                  "0"
              ) || 0
            )
          );
        },
        0
      );

    const improved =
      improveDeckWithSwaps({
        deck: nonLands,
        candidates:
          nonLandCandidates,
        roleTargets: templates,
        commanderProfile,
        theme,
        collectionCounts,
        maxBudget:
          templates.maxBudget,
        landCost,
        maxPasses: 4,
        candidateLimit: 100
      });

    deckData.cards = [
      ...lands,
      ...improved.cards
    ];

    deckData.stats.cost =
      improved.cost;

    deckData.stats.roleCounts =
      improved.roleCounts;

    deckData.stats.globalScore =
      improved.score;

    deckData.stats.swaps =
      improved.swaps;

    const totalCmc =
      improved.cards.reduce(
        (sum, card) =>
          sum +
          (Number(card.cmc) || 0),
        0
      );

    deckData.stats.avgCmc =
      improved.cards.length > 0
        ? totalCmc /
          improved.cards.length
        : 0;

    // ---------- RENDER FINAL ----------
    const finalAvailableNames =
      new Set(
        [
          commander,
          ...deckData.cards
        ].map(
          card =>
            normalizeCardName(
              card.name
            )
        )
      );

    const scoringContext = {
      commanderProfile,
      commanderSynergyMap,

      deckSynergyMap:
        computeDeckSynergyMap(
          deckData.cards,
          [
            commander,
            ...deckData.cards
          ]
        ),

      cooccurrenceMap,
      theme
    };

    const chosenCards =
      renderRecommendations(
        deckData.cards,
        collectionCounts,
        scoringContext,
        finalAvailableNames
      );

    const ownedCards =
      chosenCards.filter(
        card =>
          collectionCounts.has(
            normalizeCardName(
              card.name
            )
          )
      ).length;

    const incompleteNote =
      chosenCards.length < 99
        ? ` · Aviso: solo ` +
          `${chosenCards.length} ` +
          "cartas."
        : "";

    const finalNonLands =
      chosenCards.filter(
        card =>
          !(
            card.type_line || ""
          )
            .toLowerCase()
            .includes("land")
      );

    const globalEvaluation =
      scoreWholeDeck({
        cards: finalNonLands,
        roleTargets: templates,
        commanderProfile,
        theme
      });

    const edhrecComparison =
      compareWithAverageDeck({
        generatedDeck: chosenCards,
        averageDeck:
          edhrecData?.averageDeck || []
      });

    const edhrecSummary =
      formatEdhrecComparisonSummary(
        edhrecComparison
      );

    lastGeneratedDeck =
      chosenCards;

    lastGeneratedCommander =
      commander;

    if (exportButton) {
      exportButton.hidden = false;
    }

    updateText(
      "status",
      `Comandante: ${commander.name}`
    );

    updateText(
      "summary",
      `${chosenCards.length} cartas · ` +
        `${ownedCards} en colección · ` +
        `Inversión: $${deckData.stats.cost.toFixed(
          2
        )} · ` +
        `CMC medio: ${deckData.stats.avgCmc.toFixed(
          2
        )} · ` +
        `Coherencia: ${formatCoherenceScore(
          globalEvaluation.total
        )} · ` +
        `Swaps: ${
          deckData.stats.swaps || 0
        }` +
        edhrecSummary +
        incompleteNote
    );
  } catch (error) {
    console.error("", error);

    updateText(
      "status",
      `Error: ${
        error instanceof Error
          ? error.message
          : "Error desconocido"
      }`
    );
  } finally {
    submitButton.disabled = false;

    submitButton.textContent =
      "Generar Mazo";

    document.body.classList.remove(
      "loading"
    );
  }
}

if (typeof document !== "undefined") {
  const form =
    document.getElementById(
      "deck-form"
    );

  if (form) {
    form.addEventListener(
      "submit",
      handleSubmit
    );

    document
      .getElementById(
        "export-btn"
      )
      ?.addEventListener(
        "click",
        exportCurrentDeck
      );

    console.log(
      "Event listener attached"
    );
  } else {
    console.error(
      "ERROR: deck-form not found!"
    );
  }
}