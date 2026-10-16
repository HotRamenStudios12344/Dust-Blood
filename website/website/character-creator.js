"use strict";

/* ============================================================
   DUST & BLOOD — CHARACTER CREATOR
   Complete standalone JavaScript
   ============================================================ */

const SCORE_NAMES = [
  "Might",
  "Agility",
  "Condition",
  "Intelligence",
  "Wisdom",
  "Charisma"
];

const DEFAULT_SCORE_BANDS = [
  { min: 1, max: 1, modifier: -5 },
  { min: 2, max: 3, modifier: -4 },
  { min: 4, max: 5, modifier: -3 },
  { min: 6, max: 7, modifier: -2 },
  { min: 8, max: 9, modifier: -1 },
  { min: 10, max: 11, modifier: 0 },
  { min: 12, max: 13, modifier: 1 },
  { min: 14, max: 15, modifier: 2 },
  { min: 16, max: 17, modifier: 3 },
  { min: 18, max: 18, modifier: 4 }
];

const STORAGE_KEY = "dustAndBloodCharacters";
const CURRENT_KEY = "dustAndBloodCurrentCharacter";

let reference = { pages: [] };
let rules = {};
let character = freshCharacter();
let pendingAction = null;

/* ============================================================
   UTILITIES
   ============================================================ */

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function textOf(element) {
  return (element?.textContent || "").replace(/\s+/g, " ").trim();
}

function makeId(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function status(message, error = false) {
  const element = $("status");
  if (element) {
    element.textContent = message;
    element.dataset.error = error ? "true" : "false";
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPageTitle(page) {
  return page.title || page.name || page.id || "Untitled page";
}

function getPageRoot(page) {
  const template = document.createElement("template");
  template.innerHTML = page.body || page.html || page.content || "";
  return template.content;
}

function allPages() {
  return (reference.pages || []).map((page, index) => ({
    ...page,
    id: page.id || `page-${index + 1}`,
    title: getPageTitle(page),
    root: getPageRoot(page)
  }));
}

function parsePrice(value) {
  const match = String(value || "").match(
    /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)/ 
  );

  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function parseNumber(value, labels = []) {
  const escaped = labels.map(label =>
    label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );

  const prefix = escaped.length
    ? `(?:${escaped.join("|")})`
    : "";

  const regex = prefix
    ? new RegExp(`${prefix}\\s*[:=]?\\s*(-?\\d+(?:\\.\\d+)?)`, "i")
    : /(-?\d+(?:\.\d+)?)/;

  const match = String(value || "").match(regex);
  return match ? Number(match[1]) : null;
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn("Could not read saved data:", error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("Could not save data:", error);
    status("Could not save. Browser storage may be full.", true);
    return false;
  }
}

/* ============================================================
   CHARACTER MODEL
   ============================================================ */

function freshCharacter() {
  return {
    id: crypto.randomUUID
      ? crypto.randomUUID()
      : `character-${Date.now()}-${Math.random()}`,
    name: "",
    player: "",
    level: 1,
    xp: 0,
    reputation: 0,
    scores: {
      Might: 10,
      Agility: 10,
      Condition: 10,
      Intelligence: 10,
      Wisdom: 10,
      Charisma: 10
    },
    backgroundId: "none",
    selectedTraits: [],
    selectedFlaws: [],
    inventory: [],
    money: 0,
    debt: 0,
    backgroundApplied: false,
    notes: ""
  };
}

function normalizeCharacter(input) {
  const result = {
    ...freshCharacter(),
    ...(input || {})
  };

  result.scores = {
    ...freshCharacter().scores,
    ...(input?.scores || {})
  };

  result.selectedTraits = Array.isArray(input?.selectedTraits)
    ? input.selectedTraits
    : [];

  result.selectedFlaws = Array.isArray(input?.selectedFlaws)
    ? input.selectedFlaws
    : [];

  result.inventory = Array.isArray(input?.inventory)
    ? input.inventory
    : [];

  result.level = Math.max(1, number(result.level, 1));
  result.xp = Math.max(0, number(result.xp));
  result.money = number(result.money);
  result.debt = number(result.debt);
  result.reputation = number(result.reputation);

  return result;
}

/* ============================================================
   RULES EXTRACTION
   ============================================================ */

function extractSections() {
  const sections = [];

  for (const page of allPages()) {
    const headings = [
      ...page.root.querySelectorAll("h1,h2,h3,h4,h5,h6")
    ];

    if (!headings.length) {
      const content = textOf(page.root);

      if (content) {
        sections.push({
          id: page.id,
          pageTitle: page.title,
          heading: page.title,
          text: content,
          html: page.root.innerHTML
        });
      }

      continue;
    }

    for (const heading of headings) {
      const level = Number(heading.tagName.slice(1));
      const content = document.createElement("div");

      let sibling = heading.nextElementSibling;

      while (sibling) {
        if (
          /^H[1-6]$/.test(sibling.tagName) &&
          Number(sibling.tagName.slice(1)) <= level
        ) {
          break;
        }

        content.appendChild(sibling.cloneNode(true));
        sibling = sibling.nextElementSibling;
      }

      sections.push({
        id: page.id,
        pageTitle: page.title,
        heading: textOf(heading),
        headingId: heading.id || "",
        text: textOf(content),
        html: content.innerHTML
      });
    }
  }

  return sections;
}

function extractTables() {
  const result = [];

  for (const page of allPages()) {
    page.root.querySelectorAll("table").forEach(table => {
      const rows = [...table.querySelectorAll("tr")];
      if (rows.length < 2) return;

      const headerRow = rows.find(row =>
        row.querySelectorAll("th").length
      ) || rows[0];

      const headers = [
        ...headerRow.querySelectorAll("th,td")
      ].map(textOf);

      for (const row of rows) {
        if (row === headerRow) continue;

        const cells = [
          ...row.querySelectorAll("th,td")
        ].map(textOf);

        if (!cells.length) continue;

        const data = {};

        cells.forEach((cell, index) => {
          data[(headers[index] || `column${index + 1}`).toLowerCase()] =
            cell;
        });

        result.push({
          pageId: page.id,
          pageTitle: page.title,
          cells,
          data
        });
      }
    });
  }

  return result;
}

function extractScoreBands() {
  const found = [];

  for (const row of extractTables()) {
    if (!/score|modifier|ability/i.test(
      `${row.pageTitle} ${row.cells.join(" ")}`
    )) {
      continue;
    }

    if (row.cells.length < 2) continue;

    const range = row.cells[0].match(
      /^\s*(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*$/
    );

    const modifier = row.cells[1].match(/^[+-]?\d+$/);

    if (range && modifier) {
      found.push({
        min: Number(range[1]),
        max: Number(range[2]),
        modifier: Number(modifier[0])
      });
    }
  }

  return found.length ? found : clone(DEFAULT_SCORE_BANDS);
}

function extractScoreBonuses(text) {
  const bonuses = {};
  const pattern =
    /\b(Might|Agility|Condition|Intelligence|Wisdom|Charisma)\s*(?:\(([+-]?\d+)\)|([+-]\d+))/gi;

  let match;

  while ((match = pattern.exec(text)) !== null) {
    const score = SCORE_NAMES.find(name =>
      name.toLowerCase() === match[1].toLowerCase()
    );

    if (score) {
      bonuses[score] = Number(match[2] ?? match[3]);
    }
  }

  return bonuses;
}

function extractBackgrounds(sections) {
  const results = new Map();

  for (const section of sections) {
    const context =
      `${section.heading} ${section.pageTitle}`.toLowerCase();

    if (!context.includes("background")) continue;

    if (
      /^(backgrounds?|background rules|background overview)$/i.test(
        section.heading.trim()
      )
    ) {
      continue;
    }

    const name = section.heading.trim();
    const id = makeId(name);

    if (!id || name.length > 100) continue;

    const moneyMatch = section.text.match(
      /(?:starting money|starting cash|cash)\s*:?\s*\$?\s*(\d+(?:\.\d+)?)/i
    );

    const debtMatch = section.text.match(
      /(?:starting debt|debt)\s*:?\s*\$?\s*(\d+(?:\.\d+)?)/i
    );

    const repMatch = section.text.match(
      /(?:reputation|rep)\s*:?\s*([+-]?\d+)/i
    );

    results.set(id, {
      id,
      name,
      description: section.text,
      proficiencies: [],
      scoreBonuses: extractScoreBonuses(section.text),
      startingMoney: moneyMatch ? Number(moneyMatch[1]) : 0,
      startingDebt: debtMatch ? Number(debtMatch[1]) : 0,
      reputation: repMatch ? Number(repMatch[1]) : 0,
      startingFlaws: [],
      sourcePage: section.id
    });
  }

  return [...results.values()];
}

function extractOptions(sections, kind) {
  const results = new Map();

  for (const section of sections) {
    const context =
      `${section.heading} ${section.pageTitle}`.toLowerCase();

    if (!context.includes(kind)) continue;

    const template = document.createElement("template");
    template.innerHTML = section.html || "";

    const elements = [
      ...template.content.querySelectorAll("h2,h3,h4,h5,h6,li,dt")
    ];

    for (const element of elements) {
      const line = textOf(element);
      if (!line || line.length > 200) continue;

      if (/^(traits?|flaws?|description|cost|rank|effects?)$/i.test(line)) {
        continue;
      }

      const name = line.split(/[—–:;]/)[0].trim();
      const id = makeId(name);

      if (!id) continue;

      results.set(id, {
        id,
        name,
        description: line,
        cp: parseNumber(line, ["CP", "character points"]),
        effects: {},
        sourcePage: section.id
      });
    }
  }

  return [...results.values()];
}

function inferItemType(name, pageTitle, description) {
  const text = `${name} ${pageTitle} ${description}`.toLowerCase();

  if (/\b(pistol|revolver|shotgun|rifle|firearm|weapon|knife|gun)\b/.test(text)) {
    return "weapon";
  }

  if (/\b(armor|armour|clothing|shirt|pants|hat|boots|vest|coat)\b/.test(text)) {
    return "armor";
  }

  return "gear";
}

function extractItems() {
  const items = new Map();

  for (const row of extractTables()) {
    const name = row.cells[0];

    if (!name || /^(name|item|weapon|equipment)$/i.test(name)) continue;

    const description = row.cells.join(" ");
    const price = parsePrice(description);

    const relevant =
      price !== null ||
      /\b(pistol|revolver|shotgun|rifle|weapon|armor|armour|shirt|pants|hat|boots|knife|lasso|rope|ammunition|ammo)\b/i.test(description);

    if (!relevant) continue;

    const type = inferItemType(name, row.pageTitle, description);

    const field = patterns => {
      for (const [key, value] of Object.entries(row.data)) {
        if (patterns.some(pattern => pattern.test(key))) return value;
      }
      return "";
    };

    const item = {
      id: makeId(name),
      name,
      type,
      description,
      price: price ?? 0,
      damage: field([/damage/, /dmg/]) ||
        (description.match(/\b\d+d\d+\b/i) || [])[0] || "",
      range: field([/range/, /distance/]) || "",
      capacity: parseNumber(field([/capacity/, /magazine/])) ?? null,
      reload: parseNumber(field([/reload/])) ?? null,
      defense: parseNumber(field([/defense/, /defence/, /\bdp\b/])) ?? 0,
      slots: parseNumber(description, ["slots?"]) ?? 3,
      hitBonus: parseNumber(description, ["hit bonus"]) ?? 0,
      sourcePage: row.pageId
    };

    items.set(item.id, item);
  }

  for (const section of extractSections()) {
    if (!/equipment|weapons|firearms|armor|armour|clothing|gear|items/i.test(
      `${section.heading} ${section.pageTitle}`
    )) {
      continue;
    }

    const template = document.createElement("template");
    template.innerHTML = section.html || "";

    for (const li of template.content.querySelectorAll("li")) {
      const description = textOf(li);
      if (!description) continue;

      const price = parsePrice(description);

      if (
        price === null &&
        !/\b\d+d\d+\b|\b(pistol|revolver|shotgun|rifle|knife|armor|armour|shirt|pants|hat|boots|lasso|rope|ammo)\b/i.test(description)
      ) {
        continue;
      }

      const name = description.split(/[—–:;]/)[0].trim();
      const id = makeId(name);

      if (!id) continue;

      if (!items.has(id)) {
        items.set(id, {
          id,
          name,
          type: inferItemType(name, section.pageTitle, description),
          description,
          price: price ?? 0,
          damage: (description.match(/\b\d+d\d+\b/i) || [])[0] || "",
          range: (description.match(/\b\d+\s*(?:ft|feet)\b/i) || [])[0] || "",
          capacity: parseNumber(description, ["capacity"]) ?? null,
          reload: parseNumber(description, ["reload"]) ?? null,
          defense: parseNumber(description, ["defense", "defence", "DP"]) ?? 0,
          slots: parseNumber(description, ["slots?"]) ?? 3,
          hitBonus: parseNumber(description, ["hit bonus"]) ?? 0,
          sourcePage: section.id
        });
      }
    }
  }

  return [...items.values()];
}

function extractModifications() {
  const modifications = new Map();

  for (const row of extractTables()) {
    if (!/modification|gun mod|weapon mod/i.test(
      `${row.pageTitle} ${row.cells.join(" ")}`
    )) {
      continue;
    }

    const name = row.cells[0];
    const id = makeId(name);

    if (!id || /modifications?$/i.test(name)) continue;

    const description = row.cells.join(" ");

    modifications.set(id, {
      id,
      name,
      description,
      price: parsePrice(description) ?? 0,
      slots: parseNumber(description, ["slots?"]) ?? 1,
      effects: {
        hitBonus: parseNumber(description, ["hit bonus", "accuracy"]) ?? 0
      },
      sourcePage: row.pageId
    });
  }

  for (const section of extractSections()) {
    if (!/modification|gun mod|weapon mod/i.test(
      `${section.heading} ${section.pageTitle}`
    )) {
      continue;
    }

    const template = document.createElement("template");
    template.innerHTML = section.html || "";

    for (const li of template.content.querySelectorAll("li")) {
      const description = textOf(li);
      if (!description) continue;

      const name = description.split(/[—–:;]/)[0].trim();
      const id = makeId(name);

      if (!id) continue;

      if (!modifications.has(id)) {
        modifications.set(id, {
          id,
          name,
          description,
          price: parsePrice(description) ?? 0,
          slots: parseNumber(description, ["slots?"]) ?? 1,
          effects: {
            hitBonus: parseNumber(description, ["hit bonus", "accuracy"]) ?? 0
          },
          sourcePage: section.id
        });
      }
    }
  }

  return [...modifications.values()];
}

function extractReferenceRules(input) {
  reference = input || { pages: [] };

  const sections = extractSections();
  const allText = sections.map(section => section.text).join("\n");

  return {
    startingCP: parseNumber(allText, [
      "starting CP",
      "starting character points",
      "CP at level 1"
    ]) ?? 10,

    maxFlawCP: parseNumber(allText, [
      "maximum flaw CP",
      "max flaw CP",
      "flaw CP limit"
    ]) ?? 10,

    scoreModifierBands: extractScoreBands(),

    backgrounds: [
      {
        id: "none",
        name: "No Background Selected",
        description: "",
        proficiencies: [],
        scoreBonuses: {},
        startingMoney: 0,
        startingDebt: 0,
        reputation: 0,
        startingFlaws: []
      },
      ...extractBackgrounds(sections)
    ],

    traits: extractOptions(sections, "trait"),
    flaws: extractOptions(sections, "flaw"),
    items: extractItems(),
    modifications: extractModifications(),
    sections
  };
}

/* ============================================================
   RULE LOOKUPS
   ============================================================ */

function getBackground(id) {
  return rules.backgrounds?.find(item => item.id === id) || null;
}

function getTrait(id) {
  return rules.traits?.find(item => item.id === id) || null;
}

function getFlaw(id) {
  return rules.flaws?.find(item => item.id === id) || null;
}

function getItem(id) {
  return rules.items?.find(item => item.id === id) || null;
}

function getModification(id) {
  return rules.modifications?.find(item => item.id === id) || null;
}

function scoreModifier(score) {
  const value = number(score, 10);
  const bands = rules.scoreModifierBands || DEFAULT_SCORE_BANDS;

  const band = bands.find(item =>
    value >= item.min && value <= item.max
  );

  return band ? band.modifier : Math.floor((value - 10) / 2);
}

function traitCP() {
  return character.selectedTraits.reduce((total, selected) => {
    const trait = getTrait(selected.id);
    const cp = number(trait?.cp, 0);
    const rank = Math.max(1, number(selected.rank, 1));
    return total + cp * rank;
  }, 0);
}

function flawCP() {
  const total = character.selectedFlaws.reduce((sum, selected) => {
    const flaw = getFlaw(selected.id);
    return sum + Math.abs(number(flaw?.cp, 0));
  }, 0);

  return Math.min(number(rules.maxFlawCP, 10), total);
}

function availableCP() {
  return number(rules.startingCP, 10) + flawCP() - traitCP();
}

function selectedEffectTotal(effectName) {
  let total = 0;

  for (const selected of character.selectedTraits) {
    const trait = getTrait(selected.id);
    total += number(trait?.effects?.[effectName], 0) *
      Math.max(1, number(selected.rank, 1));
  }

  for (const selected of character.selectedFlaws) {
    const flaw = getFlaw(selected.id);
    total += number(flaw?.effects?.[effectName], 0);
  }

  return total;
}

function effectiveScore(scoreName) {
  let value = number(character.scores[scoreName], 10);

  const background = getBackground(character.backgroundId);
  value += number(background?.scoreBonuses?.[scoreName], 0);

  value += selectedEffectTotal(
    `scoreBonuses.${scoreName}`
  );

  return value;
}

function armorDefense() {
  return character.inventory.reduce((total, entry) => {
    if (!entry.equipped) return total;

    const item = getItem(entry.itemId);
    if (!item || item.type !== "armor") return total;

    return total + number(item.defense, 0);
  }, 0);
}

function defenseBonus() {
  return armorDefense() + selectedEffectTotal("defenseBonus");
}

function calculateHP() {
  return Math.max(
    1,
    10 +
      effectiveScore("Condition") +
      selectedEffectTotal("hpBonus")
  );
}

function calculateDB() {
  return defenseBonus();
}

function inventoryTotal() {
  return character.inventory.reduce((total, entry) => {
    const item = getItem(entry.itemId);
    return total + number(entry.quantity, 1) *
      number(item?.price, 0);
  }, 0);
}

function equippedWeapon() {
  const entry = character.inventory.find(item =>
    item.equipped && getItem(item.itemId)?.type === "weapon"
  );

  if (entry) return getItem(entry.itemId);

  const fallback = character.inventory.find(item =>
    getItem(item.itemId)?.type === "weapon"
  );

  return fallback ? getItem(fallback.itemId) : null;
}

function weaponStats(weapon) {
  if (!weapon) return null;

  const mods = character.inventory
    .filter(entry =>
      entry.itemId === weapon.id &&
      Array.isArray(entry.modifications)
    )
    .flatMap(entry => entry.modifications)
    .map(getModification)
    .filter(Boolean);

  return {
    ...weapon,
    hitBonus: number(weapon.hitBonus, 0) +
      mods.reduce((sum, mod) =>
        sum + number(mod.effects?.hitBonus, 0), 0)
  };
}

/* ============================================================
   BACKGROUND SELECTION
   ============================================================ */

function selectBackground(id) {
  const next = getBackground(id);

  if (!next) {
    character.backgroundId = "none";
    renderAll();
    return;
  }

  if (character.backgroundApplied) {
    const old = getBackground(character.backgroundId);

    if (old) {
      character.money -= number(old.startingMoney, 0);
      character.debt -= number(old.startingDebt, 0);
      character.reputation -= number(old.reputation, 0);

      for (const [score, bonus] of Object.entries(old.scoreBonuses || {})) {
        character.scores[score] =
          number(character.scores[score], 10) - number(bonus, 0);
      }
    }
  }

  character.backgroundId = id;

  character.money += number(next.startingMoney, 0);
  character.debt += number(next.startingDebt, 0);
  character.reputation += number(next.reputation, 0);

  character.backgroundApplied = true;

  renderAll();
  status(`Background selected: ${next.name}`);
}

function renderBackground() {
  const select = $("background-select");
  const detail = $("background-detail");

  if (select) {
    select.innerHTML = (rules.backgrounds || []).map(background =>
      `<option value="${esc(background.id)}" ${
        background.id === character.backgroundId ? "selected" : ""
      }>${esc(background.name)}</option>`
    ).join("");
  }

  if (detail) {
    const background = getBackground(character.backgroundId);

    detail.textContent = background
      ? background.description || "No description available."
      : "Select a background.";
  }
}

/* ============================================================
   SCORES
   ============================================================ */

function renderScores() {
  const container = $("scores-grid");
  if (!container) return;

  container.innerHTML = SCORE_NAMES.map(score => {
    const value = number(character.scores[score], 10);
    const effective = effectiveScore(score);
    const modifier = scoreModifier(effective);

    return `
      <div class="score-row">
        <label for="score-${esc(score)}">${esc(score)}</label>
        <input
          type="number"
          id="score-${esc(score)}"
          min="1"
          max="18"
          value="${value}"
          data-score="${esc(score)}"
        >
        <span>Effective: ${effective}</span>
        <strong>${modifier >= 0 ? "+" : ""}${modifier}</strong>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-score]").forEach(input => {
    input.addEventListener("change", () => {
      const score = input.dataset.score;
      character.scores[score] = Math.max(
        1,
        Math.min(18, number(input.value, 10))
      );
      renderAll();
    });
  });
}

/* ============================================================
   TRAITS AND FLAWS
   ============================================================ */

function optionCard(option, kind, selected) {
  const rank = number(selected?.rank, 1);

  return `
    <div class="option-card">
      <label>
        <input
          type="checkbox"
          data-option-kind="${kind}"
          data-option-id="${esc(option.id)}"
          ${selected ? "checked" : ""}
        >
        <strong>${esc(option.name)}</strong>
      </label>
      <p>${esc(option.description || "No description available.")}</p>
      <p>CP: ${number(option.cp, 0)}</p>
      ${
        kind === "trait" && selected
          ? `<label>Rank
              <select data-rank-id="${esc(option.id)}">
                ${[1, 2, 3].map(value => `
                  <option value="${value}" ${
                    value === rank ? "selected" : ""
                  }>${value}</option>
                `).join("")}
              </select>
            </label>`
          : ""
      }
    </div>
  `;
}

function renderOptions() {
  const traitsContainer = $("traits");
  const flawsContainer = $("flaws");

  if (traitsContainer) {
    traitsContainer.innerHTML = (rules.traits || []).map(trait => {
      const selected = character.selectedTraits.find(
        item => item.id === trait.id
      );

      return optionCard(trait, "trait", selected);
    }).join("");
  }

  if (flawsContainer) {
    flawsContainer.innerHTML = (rules.flaws || []).map(flaw => {
      const selected = character.selectedFlaws.find(
        item => item.id === flaw.id
      );

      return optionCard(flaw, "flaw", selected);
    }).join("");
  }

  document.querySelectorAll("[data-option-kind]").forEach(input => {
    input.addEventListener("change", () => {
      const id = input.dataset.optionId;
      const kind = input.dataset.optionKind;

      if (kind === "trait") {
        if (input.checked) {
          if (!character.selectedTraits.some(item => item.id === id)) {
            character.selectedTraits.push({ id, rank: 1 });
          }
        } else {
          character.selectedTraits =
            character.selectedTraits.filter(item => item.id !== id);
        }
      } else {
        if (input.checked) {
          if (!character.selectedFlaws.some(item => item.id === id)) {
            character.selectedFlaws.push({ id });
          }
        } else {
          character.selectedFlaws =
            character.selectedFlaws.filter(item => item.id !== id);
        }
      }

      renderAll();
    });
  });

  document.querySelectorAll("[data-rank-id]").forEach(select => {
    select.addEventListener("change", () => {
      const selected = character.selectedTraits.find(
        item => item.id === select.dataset.rankId
      );

      if (selected) {
        selected.rank = Math.max(1, number(select.value, 1));
        renderAll();
      }
    });
  });

  const summary = $("selected-options");

  if (summary) {
    const traitNames = character.selectedTraits.map(selected => {
      const trait = getTrait(selected.id);
      return trait ? `${trait.name} (Rank ${selected.rank})` : selected.id;
    });

    const flawNames = character.selectedFlaws.map(selected => {
      return getFlaw(selected.id)?.name || selected.id;
    });

    summary.textContent = [
      traitNames.length ? `Traits: ${traitNames.join(", ")}` : "Traits: none",
      flawNames.length ? `Flaws: ${flawNames.join(", ")}` : "Flaws: none"
    ].join(" | ");
  }
}

/* ============================================================
   COMBAT AND STATS
   ============================================================ */

function renderCombat() {
  const container = $("combat-stats");
  const breakdown = $("hit-breakdown");
  const notes = $("calc-notes");

  const weapon = weaponStats(equippedWeapon());

  if (container) {
    container.innerHTML = `
      <p><strong>HP:</strong> ${calculateHP()}</p>
      <p><strong>DB:</strong> ${calculateDB()}</p>
      <p><strong>AP per turn:</strong> 3</p>
      <p><strong>Movement per AP:</strong> 5 ft</p>
      <p><strong>CP remaining:</strong> ${availableCP()}</p>
      <p><strong>Money:</strong> $${number(character.money).toFixed(2)}</p>
      <p><strong>Debt:</strong> $${number(character.debt).toFixed(2)}</p>
      <p><strong>Reputation:</strong> ${character.reputation}</p>
      <p><strong>Equipped weapon:</strong> ${
        esc(weapon?.name || "None")
      }</p>
      <p><strong>Damage:</strong> ${
        esc(weapon?.damage || "—")
      }</p>
      <p><strong>Range:</strong> ${
        esc(weapon?.range || "—")
      }</p>
      <p><strong>Hit bonus:</strong> ${
        number(weapon?.hitBonus, 0)
      }</p>
    `;
  }

  if (breakdown) {
    breakdown.textContent =
      `DB ${calculateDB()} = equipped armor defense and applicable defense bonuses.`;
  }

  if (notes) {
    notes.textContent =
      "HP uses the character-creation formula of 10 + effective Condition + detected HP bonuses. Level-up HP and other conditional effects must follow their specific rules.";
  }

  const cp = $("sum-cp");
  if (cp) cp.textContent = availableCP();

  const hp = $("sum-hp");
  if (hp) hp.textContent = calculateHP();

  const money = $("sum-money");
  if (money) money.textContent = `$${number(character.money).toFixed(2)}`;

  const level = $("sum-level");
  if (level) level.textContent = character.level;
}

/* ============================================================
   INVENTORY
   ============================================================ */

function itemTooltip(item) {
  return [
    item.name,
    item.description,
    item.damage ? `Damage: ${item.damage}` : "",
    item.range ? `Range: ${item.range}` : "",
    `Price: $${number(item.price).toFixed(2)}`
  ].filter(Boolean).join("\n");
}

function renderInventory() {
  const container = $("inventory-list");
  const totalElement = $("inventory-total");

  if (totalElement) {
    totalElement.textContent = `$${inventoryTotal().toFixed(2)}`;
  }

  if (!container) return;

  container.innerHTML = character.inventory.map((entry, index) => {
    const item = getItem(entry.itemId);
    const name = item?.name || entry.customName || entry.itemId;
    const quantity = Math.max(1, number(entry.quantity, 1));

    const modifications = (entry.modifications || []).map(id =>
      getModification(id)?.name || id
    );

    return `
      <div class="inventory-entry">
        <strong>${esc(name)}</strong>
        <span>Quantity: ${quantity}</span>
        <span>Equipped: ${entry.equipped ? "Yes" : "No"}</span>
        ${
          modifications.length
            ? `<span>Mods: ${esc(modifications.join(", "))}</span>`
            : ""
        }
        <div>
          <button type="button" data-inventory-action="equip" data-index="${index}">
            ${entry.equipped ? "Unequip" : "Equip"}
          </button>
          <button type="button" data-inventory-action="quantity" data-index="${index}">
            Change Quantity
          </button>
          <button type="button" data-inventory-action="remove" data-index="${index}">
            Remove
          </button>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-inventory-action]").forEach(button => {
    button.addEventListener("click", () => {
      inventoryAction(
        button.dataset.inventoryAction,
        Number(button.dataset.index)
      );
    });
  });
}

function inventoryAction(action, index) {
  const entry = character.inventory[index];
  if (!entry) return;

  if (action === "equip") {
    const item = getItem(entry.itemId);

    if (item?.type === "weapon" || item?.type === "armor") {
      character.inventory.forEach(other => {
        const otherItem = getItem(other.itemId);

        if (
          other !== entry &&
          otherItem &&
          otherItem.type === item.type
        ) {
          other.equipped = false;
        }
      });
    }

    entry.equipped = !entry.equipped;
  }

  if (action === "quantity") {
    const quantity = prompt(
      "Enter quantity:",
      String(entry.quantity || 1)
    );

    if (quantity === null) return;

    entry.quantity = Math.max(1, Math.floor(number(quantity, 1)));
  }

  if (action === "remove") {
    if (!confirm("Remove this item from the inventory?")) return;
    character.inventory.splice(index, 1);
  }

  renderAll();
}

function addItem(itemId, quantity = 1, free = false) {
  const item = getItem(itemId);

  if (!item) {
    status("Item not found in the reference.", true);
    return false;
  }

  quantity = Math.max(1, Math.floor(number(quantity, 1)));

  const cost = number(item.price, 0) * quantity;

  if (!free && character.money < cost) {
    status("Not enough money to purchase this item.", true);
    return false;
  }

  if (!free) character.money -= cost;

  const existing = character.inventory.find(entry =>
    entry.itemId === itemId &&
    !entry.equipped &&
    !(entry.modifications || []).length
  );

  if (existing) {
    existing.quantity = number(existing.quantity, 1) + quantity;
  } else {
    character.inventory.push({
      itemId,
      quantity,
      equipped: false,
      modifications: []
    });
  }

  renderAll();
  status(`Added ${quantity} × ${item.name}.`);
  return true;
}

function addCustomItem() {
  const name = prompt("Custom item name:");
  if (!name?.trim()) return;

  const priceInput = prompt("Item price:", "0");
  if (priceInput === null) return;

  const price = Math.max(0, number(priceInput, 0));

  if (character.money < price) {
    status("Not enough money.", true);
    return;
  }

  character.money -= price;

  character.inventory.push({
    itemId: `custom-${makeId(name)}-${Date.now()}`,
    customName: name.trim(),
    customPrice: price,
    quantity: 1,
    equipped: false,
    modifications: []
  });

  renderAll();
}

/* ============================================================
   CATALOG
   ============================================================ */

function renderCatalog() {
  const container = $("catalog");
  if (!container) return;

  const items = rules.items || [];

  container.innerHTML = items.map(item => `
    <div class="catalog-entry">
      <strong>${esc(item.name)}</strong>
      <span>${esc(item.type)}</span>
      <p>${esc(item.description || "")}</p>
      <p>Price: $${number(item.price).toFixed(2)}</p>
      ${
        item.damage
          ? `<p>Damage: ${esc(item.damage)}</p>`
          : ""
      }
      ${
        item.range
          ? `<p>Range: ${esc(item.range)}</p>`
          : ""
      }
      <button type="button" data-add-item="${esc(item.id)}">
        Add / Purchase
      </button>
    </div>
  `).join("");

  container.querySelectorAll("[data-add-item]").forEach(button => {
    button.addEventListener("click", () => {
      const quantityInput = $("catalog-qty");
      const quantity = quantityInput
        ? Math.max(1, number(quantityInput.value, 1))
        : 1;

      addItem(button.dataset.addItem, quantity);
    });
  });
}

/* ============================================================
   SAVING AND LOADING
   ============================================================ */

function getSavedCharacters() {
  const saved = readStorage(STORAGE_KEY, []);
  return Array.isArray(saved) ? saved : [];
}

function saveCharacter() {
  const saved = getSavedCharacters();
  const index = saved.findIndex(item => item.id === character.id);

  const snapshot = clone(character);

  if (index >= 0) {
    saved[index] = snapshot;
  } else {
    saved.push(snapshot);
  }

  if (!writeStorage(STORAGE_KEY, saved)) return;

  writeStorage(CURRENT_KEY, snapshot);
  renderSaves();
  status("Character saved.");
}

function loadCharacter(id) {
  const saved = getSavedCharacters();
  const found = saved.find(item => item.id === id);

  if (!found) {
    status("Saved character not found.", true);
    return;
  }

  character = normalizeCharacter(found);

  writeStorage(CURRENT_KEY, character);
  syncInputs();
  renderAll();
  status(`Loaded ${character.name || "character"}.`);
}

function deleteCharacter(id) {
  const saved = getSavedCharacters().filter(item => item.id !== id);

  writeStorage(STORAGE_KEY, saved);

  if (character.id === id) {
    character = freshCharacter();
    writeStorage(CURRENT_KEY, character);
    syncInputs();
  }

  renderSaves();
  renderAll();
  status("Saved character deleted.");
}

function renderSaves() {
  const container = $("saved-list");
  if (!container) return;

  const saved = getSavedCharacters();

  container.innerHTML = saved.map(item => `
    <div class="saved-character">
      <strong>${esc(item.name || "Unnamed Character")}</strong>
      <span>Level ${number(item.level, 1)}</span>
      <button type="button" data-load-id="${esc(item.id)}">Load</button>
      <button type="button" data-delete-id="${esc(item.id)}">Delete</button>
    </div>
  `).join("");

  container.querySelectorAll("[data-load-id]").forEach(button => {
    button.addEventListener("click", () => {
      loadCharacter(button.dataset.loadId);
    });
  });

  container.querySelectorAll("[data-delete-id]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteId;

      if (confirm("Delete this saved character?")) {
        deleteCharacter(id);
      }
    });
  });
}

function exportCharacter() {
  const blob = new Blob(
    [JSON.stringify(character, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${makeId(character.name || "character")}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
  status("Character exported.");
}

function importCharacterFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));

      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid character file.");
      }

      character = normalizeCharacter(parsed);
      writeStorage(CURRENT_KEY, character);
      renderAll();
      syncInputs();
      status("Character imported.");
    } catch (error) {
      console.error(error);
      status("Could not import that JSON file.", true);
    }
  };

  reader.readAsText(file);
}

/* ============================================================
   FORM SYNCHRONIZATION
   ============================================================ */

function syncInputs() {
  const fields = {
    name: character.name,
    player: character.player,
    level: character.level,
    xp: character.xp,
    reputation: character.reputation
  };

  for (const [id, value] of Object.entries(fields)) {
    const element = $(id);
    if (element) element.value = value;
  }

  const background = $("background-select");
  if (background) background.value = character.backgroundId;
}

function bindTextField(id, property, convert = value => value) {
  const element = $(id);
  if (!element) return;

  element.addEventListener("change", () => {
    character[property] = convert(element.value);
    renderAll();
  });
}

function bindEvents() {
  bindTextField("name", "name");
  bindTextField("player", "player");
  bindTextField("level", "level", value =>
    Math.max(1, Math.floor(number(value, 1)))
  );
  bindTextField("xp", "xp", value =>
    Math.max(0, number(value, 0))
  );
  bindTextField("reputation", "reputation", value =>
    number(value, 0)
  );

  const backgroundSelect = $("background-select");

  if (backgroundSelect) {
    backgroundSelect.addEventListener("change", () => {
      selectBackground(backgroundSelect.value);
    });
  }

  const saveButton = $("save-character");
  if (saveButton) saveButton.addEventListener("click", saveCharacter);

  const newButton = $("new-character");

  if (newButton) {
    newButton.addEventListener("click", () => {
      if (!confirm("Create a new character? Unsaved changes will be lost.")) {
        return;
      }

      character = freshCharacter();
      writeStorage(CURRENT_KEY, character);
      syncInputs();
      renderAll();
      status("New character created.");
    });
  }

  const exportButton = $("export-character");
  if (exportButton) {
    exportButton.addEventListener("click", exportCharacter);
  }

  const importButton = $("import-character");

  if (importButton) {
    importButton.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";

      input.addEventListener("change", () => {
        importCharacterFile(input.files?.[0]);
      });

      input.click();
    });
  }

  const customButton = $("add-custom");

  if (customButton) {
    customButton.addEventListener("click", addCustomItem);
  }

  const addCatalogButton = $("add-catalog");

  if (addCatalogButton) {
    addCatalogButton.addEventListener("click", () => {
      const input = $("catalog-qty");
      const quantity = input
        ? Math.max(1, number(input.value, 1))
        : 1;

      const firstItem = rules.items?.[0];

      if (firstItem) {
        addItem(firstItem.id, quantity);
      } else {
        status("No catalog items were extracted.", true);
      }
    });
  }

  const notes = $("notes");

  if (notes) {
    notes.value = character.notes || "";

    notes.addEventListener("change", () => {
      character.notes = notes.value;
    });
  }
}

/* ============================================================
   MAIN RENDERER
   ============================================================ */

function renderAll() {
  renderScores();
  renderBackground();
  renderOptions();
  renderCombat();
  renderInventory();
  renderCatalog();
  renderSaves();
  syncInputs();
}

/* ============================================================
   INITIALIZATION
   ============================================================ */

async function init() {
  try {
    status("Loading Dust & Blood rules...");

    const response = await fetch("data/rules.json");

    if (!response.ok) {
      throw new Error(
        `Could not load data/rules.json (${response.status}).`
      );
    }

    const loaded = await response.json();

    if (!Array.isArray(loaded.pages)) {
      throw new Error(
        "The rules file must contain a pages array."
      );
    }

    reference = loaded;
    rules = extractReferenceRules(reference);

    const current = readStorage(CURRENT_KEY, null);

    if (current && typeof current === "object") {
      character = normalizeCharacter(current);
    } else {
      character = freshCharacter();
    }

    bindEvents();
    syncInputs();
    renderAll();

    status(
      `Rules loaded. Backgrounds: ${rules.backgrounds.length - 1}; ` +
      `traits: ${rules.traits.length}; flaws: ${rules.flaws.length}; ` +
      `items: ${rules.items.length}; modifications: ${rules.modifications.length}.`
    );

    console.info("Dust & Blood rules loaded:", rules);
  } catch (error) {
    console.error("Character Creator initialization failed:", error);
    status(
      `Initialization failed: ${error.message}`,
      true
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}