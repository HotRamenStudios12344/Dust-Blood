let rulesData = null;
let metadataData = null;
let changelogData = { changes: [] };

const content = document.getElementById("content");
const sidebar = document.getElementById("sidebar");
const breadcrumb = document.getElementById("breadcrumb-current");
const toc = document.getElementById("table-of-contents");
const search = document.getElementById("search");
const resultsBox = document.getElementById("search-results");

const escapeHTML = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

// Load generated data files.
async function loadRulebook() {
  try {
    const [rulesResponse, metadataResponse, changesResponse] =
      await Promise.all([
        fetch("./data/rules.json"),
        fetch("./data/metadata.json"),
        fetch("./data/changelog.json")
      ]);

    for (const response of [
      rulesResponse,
      metadataResponse,
      changesResponse
    ]) {
      if (!response.ok) {
        throw new Error(`Could not load ${response.url}`);
      }
    }

    rulesData = await rulesResponse.json();
    metadataData = await metadataResponse.json();
    changelogData = await changesResponse.json();

    if (!Array.isArray(rulesData.pages)) {
      throw new Error("rules.json must contain a pages array.");
    }

    updateEdition();
    renderNavigation();
    renderChangeLog();

    const initialPage = rulesData.pages.find(
      page => page.id === "overview"
    ) || rulesData.pages[0];

    if (initialPage) {
      renderPage(initialPage.id, false);
    }
  } catch (error) {
    console.error("Failed to load Dust & Blood:", error);

    content.innerHTML = `
      <h1>Unable to load rules</h1>
      <p>Check that the parser generated the JSON files in the
      website/data folder, then reload this page through a local
      web server.</p>
      <p class="muted">${escapeHTML(error.message)}</p>
    `;
  }
}

function updateEdition() {
  const edition = metadataData.currentEdition || "Edition unspecified";
  const status = metadataData.publicationStatus || "";

  const editionLabel = document.getElementById("edition-label");
  if (editionLabel) editionLabel.textContent = edition;

  const footerEdition = document.getElementById("footer-edition");
  if (footerEdition) {
    footerEdition.textContent = status
      ? `${edition} · ${status}`
      : edition;
  }
}

function getPages() {
  return rulesData?.pages || [];
}

function findPage(id) {
  return getPages().find(page => page.id === id);
}

// Create the sidebar from the page data.
function renderNavigation() {
  const navigation = document.getElementById("navigation");
  if (!navigation) return;

  navigation.replaceChildren();

  let currentCategory = "";

  for (const page of getPages()) {
    const category = page.category || "Rules";

    if (category !== currentCategory) {
      currentCategory = category;

      const heading = document.createElement("div");
      heading.className = "nav-heading";
      heading.textContent = category;
      navigation.appendChild(heading);
    }

    const link = document.createElement("a");
    link.href = "#";
    link.className = "nav-link";
    link.dataset.page = page.id;
    link.textContent = page.title;

    link.addEventListener("click", event => {
      event.preventDefault();
      renderPage(page.id);
    });

    navigation.appendChild(link);
  }
}

// Convert a structured page's sections and blocks into article HTML.
// A page.body string is also supported for migration of existing pages.
function renderPageBody(page) {
  if (typeof page.body === "string") {
    return page.body;
  }

  let html = "";

  if (page.summary) {
    html += `<p class="lead">${escapeHTML(page.summary)}</p>`;
  }

  for (const section of page.sections || []) {
    html += `<section id="${escapeHTML(section.id)}">`;
    html += `<h2>${escapeHTML(section.title)}</h2>`;

    for (const block of section.blocks || []) {
      if (block.type === "paragraph") {
        html += `<p>${escapeHTML(block.text)}</p>`;
      }

      if (block.type === "list") {
        html += "<ul>";

        for (const item of block.items || []) {
          html += `<li>${escapeHTML(item)}</li>`;
        }

        html += "</ul>";
      }

      if (block.type === "table") {
        html += '<div class="table-wrap"><table><thead><tr>';

        for (const heading of block.headers || []) {
          html += `<th>${escapeHTML(heading)}</th>`;
        }

        html += "</tr></thead><tbody>";

        for (const row of block.rows || []) {
          html += "<tr>";

          for (const cell of row) {
            html += `<td>${escapeHTML(cell)}</td>`;
          }

          html += "</tr>";
        }

        html += "</tbody></table></div>";
      }

      // HTML blocks must come from your own trusted rules source.
      if (block.type === "html") {
        html += block.html || "";
      }
    }

    html += "</section>";
  }

  return html;
}

function renderPage(id, scroll = true) {
  const page = findPage(id);

  if (!page) {
    console.warn(`Unknown rules page: ${id}`);
    return;
  }

  content.innerHTML = "";

  const pageHeading = document.createElement("h1");
  pageHeading.innerHTML = escapeHTML(page.title);
  content.appendChild(pageHeading);

  // Render the body, which may contain its own heading in legacy pages.
  // Structured pages have their headings generated above.
  if (typeof page.body === "string") {
    content.innerHTML = page.body;
  } else {
    content.innerHTML =
      `<h1>${escapeHTML(page.title)}</h1>` + renderPageBody(page);
  }

  breadcrumb.textContent = page.title;
  document.title = `${page.title} — Dust & Blood`;

  document.querySelectorAll(".nav-link").forEach(link => {
    link.classList.toggle("active", link.dataset.page === id);
  });

  const headings = [...content.querySelectorAll("h2, h3")];

  toc.innerHTML = headings.length
    ? headings.map((heading, index) => {
        if (!heading.id) {
          heading.id = `section-${index}`;
        }

        return `<a class="toc-link" href="#${escapeHTML(heading.id)}">` +
          `${escapeHTML(heading.textContent)}</a>`;
      }).join("")
    : '<span class="muted">No sections</span>';

  content.querySelectorAll("a[data-page]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      renderPage(link.dataset.page);
    });
  });

  if (scroll) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  sidebar?.classList.remove("open");
}

// Turn the page content into searchable plain text.
function plainText(html) {
  const temporary = document.createElement("div");
  temporary.innerHTML = html;
  return temporary.textContent || temporary.innerText || "";
}

function allSearchEntries() {
  return getPages().map(page => ({
    id: page.id,
    title: page.title,
    text: plainText(renderPageBody(page))
  }));
}

function runSearch(query) {
  const q = query.trim().toLowerCase();

  if (!q) {
    resultsBox.classList.add("hidden");
    resultsBox.innerHTML = "";
    return;
  }

  const matches = allSearchEntries()
    .map(page => ({
      ...page,
      score:
        (page.title.toLowerCase().includes(q) ? 5 : 0) +
        (page.text.toLowerCase().includes(q) ? 1 : 0)
    }))
    .filter(page => page.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  resultsBox.classList.remove("hidden");

  if (!matches.length) {
    resultsBox.innerHTML =
      '<div class="no-results">No matching rules found.</div>';
    return;
  }

  resultsBox.innerHTML = matches.map(page => {
    const text = page.text.toLowerCase();
    const index = text.indexOf(q);

    const excerpt = index >= 0
      ? page.text.slice(Math.max(0, index - 50), index + 110)
      : page.text.slice(0, 130);

    return `
      <a class="search-result" href="#"
         data-result-page="${escapeHTML(page.id)}">
        <strong>${escapeHTML(page.title)}</strong>
        <small>${escapeHTML(excerpt.trim())}…</small>
      </a>
    `;
  }).join("");

  resultsBox.querySelectorAll("[data-result-page]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      renderPage(link.dataset.resultPage);
      resultsBox.classList.add("hidden");
      search.value = "";
    });
  });
}

// Render the edition-by-edition change history.
function renderChangeLog() {
  const container = document.getElementById("changelog-content");
  if (!container) return;

  const changes = changelogData.changes || [];

  if (!changes.length) {
    container.innerHTML = "<p>No changes have been recorded yet.</p>";
    return;
  }

  container.innerHTML = changes.map(change => `
    <article class="change-entry">
      <div class="change-edition">${escapeHTML(change.edition)}</div>
      <h3>${escapeHTML(change.title)}</h3>
      <time datetime="${escapeHTML(change.date)}">
        ${escapeHTML(change.date)}
      </time>
      <p>${escapeHTML(change.description)}</p>
      <small>Section: ${escapeHTML(change.section)}</small>
    </article>
  `).join("");
}

// History modal controls. These work when the corresponding HTML exists.
function setHistoryOpen(open) {
  const modal = document.getElementById("changelog-modal");
  if (!modal) return;

  modal.classList.toggle("hidden", !open);
}

document.getElementById("changelog-open")
  ?.addEventListener("click", () => setHistoryOpen(true));

document.getElementById("changelog-close")
  ?.addEventListener("click", () => setHistoryOpen(false));

document.querySelectorAll("[data-close-modal]").forEach(element => {
  element.addEventListener("click", () => setHistoryOpen(false));
});

// Search field and keyboard shortcuts.
search?.addEventListener("input", () => runSearch(search.value));

search?.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    search.value = "";
    resultsBox.classList.add("hidden");
  }

  if (event.key === "Enter") {
    resultsBox.querySelector("[data-result-page]")?.click();
  }
});

document.addEventListener("click", event => {
  if (!event.target.closest(".search-wrap")) {
    resultsBox.classList.add("hidden");
  }
});

document.getElementById("mobile-menu")
  ?.addEventListener("click", () => sidebar?.classList.toggle("open"));

document.addEventListener("keydown", event => {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    search?.focus();
  }

  if (event.key === "Escape") {
    setHistoryOpen(false);
  }
});

// Start only after the browser has loaded the page.
loadRulebook();