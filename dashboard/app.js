/**
 * aweskill dashboard — hash router, API utilities, and page renderers.
 */

const API_BASE = "/api";
const DEFAULT_HASH = "#/skills";

/** Route names used for dispatch and sidebar highlighting. */
const ROUTE = {
  SKILLS: "skills",
  SKILL_DETAIL: "skill-detail",
  BUNDLES: "bundles",
  AGENTS: "agents",
  HEALTH: "health",
};

/** Maps each route to the sidebar link that should appear active. */
const NAV_HASH_BY_ROUTE = {
  [ROUTE.SKILLS]: "#/skills",
  [ROUTE.SKILL_DETAIL]: "#/skills",
  [ROUTE.BUNDLES]: "#/bundles",
  [ROUTE.AGENTS]: "#/agents",
  [ROUTE.HEALTH]: "#/health",
};

const contentEl = document.getElementById("content");
const storeRootEl = document.getElementById("store-root");
const storeSkillCountEl = document.getElementById("store-skill-count");
const storeBundleCountEl = document.getElementById("store-bundle-count");

/**
 * Fetch JSON from the dashboard API.
 * Relative base keeps the SPA portable across host/port without configuration.
 */
async function fetchJson(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${API_BASE}${normalizedPath}`);

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Escape user-controlled text before inserting into innerHTML placeholders.
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Monotonic tokens so stale async renders are ignored after navigation. */
let skillsListRenderToken = 0;
let skillDetailRenderToken = 0;
let bundlesListRenderToken = 0;
let agentsListRenderToken = 0;

/**
 * Minimal page shell with a loading indicator.
 */
function renderLoadingPage(title, message = "Loading…") {
  contentEl.innerHTML = `
    <div class="page">
      <header class="page__header">
        <h2 class="page__title">${escapeHtml(title)}</h2>
      </header>
      <p class="loading">${escapeHtml(message)}</p>
    </div>
  `;
}

/**
 * Minimal page shell with an error banner.
 */
function renderErrorPage(title, message) {
  contentEl.innerHTML = `
    <div class="page">
      <header class="page__header">
        <h2 class="page__title">${escapeHtml(title)}</h2>
      </header>
      <div class="error-state" role="alert">${escapeHtml(message)}</div>
    </div>
  `;
}

function formatDate(isoString) {
  if (!isoString) {
    return "—";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSkillSource(lockEntry) {
  if (!lockEntry) {
    return "—";
  }

  return lockEntry.source || lockEntry.sourceUrl || "—";
}

function skillMatchesQuery(skill, query) {
  if (!query) {
    return true;
  }

  const haystack = `${skill.name} ${skill.description ?? ""}`.toLowerCase();
  return haystack.includes(query);
}

function renderSkillCard(skill) {
  const description = skill.description || "No description";
  const source = formatSkillSource(skill.lockEntry);
  const installedAt = skill.lockEntry?.installedAt
    ? formatDate(skill.lockEntry.installedAt)
    : "—";

  return `
    <article class="card card--clickable" data-skill-name="${escapeHtml(skill.name)}" tabindex="0" role="link" aria-label="View ${escapeHtml(skill.name)}">
      <header class="card__header">
        <h3 class="card__title">${escapeHtml(skill.name)}</h3>
      </header>
      <div class="card__body">${escapeHtml(description)}</div>
      <footer class="card__meta">
        <span class="card__meta-item">Source: <span class="mono">${escapeHtml(source)}</span></span>
        <span class="card__meta-item">Installed: ${escapeHtml(installedAt)}</span>
      </footer>
    </article>
  `;
}

function renderSkillsGrid(skills) {
  if (skills.length === 0) {
    return `<p class="empty-state">No skills match your search.</p>`;
  }

  return `<div class="card-grid">${skills.map(renderSkillCard).join("")}</div>`;
}

function bindSkillsListInteractions() {
  contentEl.querySelectorAll(".card--clickable[data-skill-name]").forEach((card) => {
    const navigate = () => {
      const name = card.getAttribute("data-skill-name");
      if (name) {
        window.location.hash = `#/skills/${encodeURIComponent(name)}`;
      }
    };

    card.addEventListener("click", navigate);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigate();
      }
    });
  });
}

function renderSkillsListContent(skills, query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = skills.filter((skill) => skillMatchesQuery(skill, normalizedQuery));
  const gridEl = contentEl.querySelector("#skills-grid");

  if (gridEl) {
    gridEl.innerHTML = renderSkillsGrid(filtered);
    bindSkillsListInteractions();
  }
}

function renderSkillsListShell(skills) {
  const countLabel = skills.length === 1 ? "1 skill" : `${skills.length} skills`;

  contentEl.innerHTML = `
    <div class="page">
      <header class="page__header">
        <h2 class="page__title">Skills</h2>
        <p class="page__subtitle">${escapeHtml(countLabel)} in store</p>
      </header>
      <div class="page__toolbar">
        <div class="search">
          <input
            type="search"
            class="search__input"
            id="skills-search"
            placeholder="Filter by name or description…"
            aria-label="Filter skills by name or description"
            autocomplete="off"
          />
        </div>
      </div>
      <div id="skills-grid">${renderSkillsGrid(skills)}</div>
    </div>
  `;

  const searchInput = contentEl.querySelector("#skills-search");
  searchInput?.addEventListener("input", (event) => {
    renderSkillsListContent(skills, event.target.value);
  });

  bindSkillsListInteractions();
}

async function renderSkillsPage() {
  const token = ++skillsListRenderToken;
  renderLoadingPage("Skills");

  try {
    const skills = await fetchJson("/skills");
    if (token !== skillsListRenderToken) {
      return;
    }

    if (skills.length === 0) {
      contentEl.innerHTML = `
        <div class="page">
          <header class="page__header">
            <h2 class="page__title">Skills</h2>
            <p class="page__subtitle">No skills installed</p>
          </header>
          <p class="empty-state">Your skill store is empty. Install skills with <code class="mono">aweskill install</code>.</p>
        </div>
      `;
      return;
    }

    renderSkillsListShell(skills);
  } catch (error) {
    if (token !== skillsListRenderToken) {
      return;
    }

    const message = error instanceof Error ? error.message : "Failed to load skills";
    renderErrorPage("Skills", message);
  }
}

function renderKeyValueList(entries) {
  if (entries.length === 0) {
    return `<p class="text-muted">None</p>`;
  }

  return `
    <dl class="kv-list">
      ${entries
        .map(
          ([key, value]) => `
        <div>
          <dt>${escapeHtml(key)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `,
        )
        .join("")}
    </dl>
  `;
}

function formatLockValue(key, value) {
  if (value == null || value === "") {
    return "—";
  }

  if (key === "installedAt" || key === "updatedAt") {
    return formatDate(String(value));
  }

  return String(value);
}

function renderLockSection(lockEntry) {
  if (!lockEntry) {
    return `
      <section class="detail__section">
        <h3 class="detail__section-title">Lock file</h3>
        <div class="detail__section-body">
          <p class="text-muted">No lock entry for this skill.</p>
        </div>
      </section>
    `;
  }

  const entries = Object.entries(lockEntry).map(([key, value]) => [
    key,
    formatLockValue(key, value),
  ]);

  return `
    <section class="detail__section">
      <h3 class="detail__section-title">Lock file</h3>
      <div class="detail__section-body">
        ${renderKeyValueList(entries)}
      </div>
    </section>
  `;
}

function renderFrontmatterSection(frontmatter) {
  const entries = Object.entries(frontmatter ?? {}).map(([key, value]) => [
    key,
    typeof value === "object" && value !== null ? JSON.stringify(value) : String(value),
  ]);

  return `
    <section class="detail__section">
      <h3 class="detail__section-title">Frontmatter</h3>
      <div class="detail__section-body">
        ${renderKeyValueList(entries)}
      </div>
    </section>
  `;
}

function renderBodyPreview(body) {
  const preview = body?.trim() ? body : "No body content.";

  return `
    <section class="detail__section">
      <h3 class="detail__section-title">Body preview</h3>
      <div class="detail__section-body">
        <pre class="code-block">${escapeHtml(preview)}</pre>
      </div>
    </section>
  `;
}

async function renderSkillDetailPage(name) {
  const token = ++skillDetailRenderToken;
  renderLoadingPage(name, "Loading skill…");

  try {
    const skill = await fetchJson(`/skills/${encodeURIComponent(name)}`);
    if (token !== skillDetailRenderToken) {
      return;
    }

    const descriptionBlock = skill.description
      ? `<p class="page__subtitle">${escapeHtml(skill.description)}</p>`
      : "";

    contentEl.innerHTML = `
      <div class="page">
        <header class="page__header">
          <p class="text-muted"><a href="#/skills">← Back to Skills</a></p>
          <h2 class="page__title">${escapeHtml(skill.name)}</h2>
          ${descriptionBlock}
        </header>
        <div class="detail">
          ${renderFrontmatterSection(skill.frontmatter)}
          ${renderBodyPreview(skill.body)}
          ${renderLockSection(skill.lockEntry)}
        </div>
      </div>
    `;
  } catch (error) {
    if (token !== skillDetailRenderToken) {
      return;
    }

    const message = error instanceof Error ? error.message : "Failed to load skill";
    contentEl.innerHTML = `
      <div class="page">
        <header class="page__header">
          <p class="text-muted"><a href="#/skills">← Back to Skills</a></p>
          <h2 class="page__title">${escapeHtml(name)}</h2>
        </header>
        <div class="error-state" role="alert">${escapeHtml(message)}</div>
      </div>
    `;
  }
}

function renderPlaceholder(title, message) {
  contentEl.innerHTML = `
    <div class="page">
      <header class="page__header">
        <h2 class="page__title">${escapeHtml(title)}</h2>
      </header>
      <p class="loading">${escapeHtml(message)}</p>
    </div>
  `;
}

/** Badge class and label reflect whether the skill directory exists in the store. */
function renderBundleSkillItem(skill) {
  const badgeClass = skill.exists ? "badge--success" : "badge--warning";
  const badgeLabel = skill.exists ? "Installed" : "Missing";

  return `
    <li class="tag-list__item">
      <span class="mono">${escapeHtml(skill.name)}</span>
      <span class="badge ${badgeClass} badge--dot">${escapeHtml(badgeLabel)}</span>
    </li>
  `;
}

function renderBundleCard(bundle) {
  const skillCount = bundle.skills.length;
  const countLabel = skillCount === 1 ? "1 skill" : `${skillCount} skills`;
  const skillsContent =
    skillCount === 0
      ? `<p class="text-muted">No skills in this bundle.</p>`
      : `<ul class="tag-list">${bundle.skills.map(renderBundleSkillItem).join("")}</ul>`;

  return `
    <article class="card">
      <header class="card__header">
        <h3 class="card__title">${escapeHtml(bundle.name)}</h3>
      </header>
      <div class="card__body">${skillsContent}</div>
      <footer class="card__meta">
        <span class="card__meta-item">${escapeHtml(countLabel)}</span>
      </footer>
    </article>
  `;
}

function renderBundlesGrid(bundles) {
  return `<div class="card-grid">${bundles.map(renderBundleCard).join("")}</div>`;
}

async function renderBundlesPage() {
  const token = ++bundlesListRenderToken;
  renderLoadingPage("Bundles");

  try {
    const bundles = await fetchJson("/bundles");
    if (token !== bundlesListRenderToken) {
      return;
    }

    if (bundles.length === 0) {
      contentEl.innerHTML = `
        <div class="page">
          <header class="page__header">
            <h2 class="page__title">Bundles</h2>
            <p class="page__subtitle">No bundles defined</p>
          </header>
          <p class="empty-state">Create bundles with <code class="mono">aweskill bundle create</code>.</p>
        </div>
      `;
      return;
    }

    const countLabel = bundles.length === 1 ? "1 bundle" : `${bundles.length} bundles`;

    contentEl.innerHTML = `
      <div class="page">
        <header class="page__header">
          <h2 class="page__title">Bundles</h2>
          <p class="page__subtitle">${escapeHtml(countLabel)} in store</p>
        </header>
        ${renderBundlesGrid(bundles)}
      </div>
    `;
  } catch (error) {
    if (token !== bundlesListRenderToken) {
      return;
    }

    const message = error instanceof Error ? error.message : "Failed to load bundles";
    renderErrorPage("Bundles", message);
  }
}

/** Badge class and label reflect whether the agent's global skills directory exists. */
function renderAgentStatusBadge(installed) {
  const badgeClass = installed ? "badge--success" : "badge--muted";
  const badgeLabel = installed ? "Installed" : "Not installed";

  return `<span class="badge ${badgeClass} badge--dot">${escapeHtml(badgeLabel)}</span>`;
}

function renderAgentGlobalSkillsDir(globalSkillsDir) {
  if (!globalSkillsDir) {
    return "—";
  }

  return `<span class="mono">${escapeHtml(globalSkillsDir)}</span>`;
}

function renderAgentRow(agent) {
  return `
    <tr>
      <td>${escapeHtml(agent.displayName)}</td>
      <td>${renderAgentStatusBadge(agent.installed)}</td>
      <td>${renderAgentGlobalSkillsDir(agent.globalSkillsDir)}</td>
      <td class="num">${escapeHtml(String(agent.projectedSkillCount ?? 0))}</td>
    </tr>
  `;
}

function renderAgentsTable(agents) {
  return `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Display name</th>
            <th>Status</th>
            <th>Global skills directory</th>
            <th class="num">Projected skills</th>
          </tr>
        </thead>
        <tbody>
          ${agents.map(renderAgentRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderAgentsPage() {
  const token = ++agentsListRenderToken;
  renderLoadingPage("Agents");

  try {
    const agents = await fetchJson("/agents");
    if (token !== agentsListRenderToken) {
      return;
    }

    const installedCount = agents.filter((agent) => agent.installed).length;
    const countLabel = agents.length === 1 ? "1 agent" : `${agents.length} agents`;
    const installedLabel =
      installedCount === 1 ? "1 installed" : `${installedCount} installed`;

    contentEl.innerHTML = `
      <div class="page">
        <header class="page__header">
          <h2 class="page__title">Agents</h2>
          <p class="page__subtitle">${escapeHtml(countLabel)} supported · ${escapeHtml(installedLabel)}</p>
        </header>
        ${renderAgentsTable(agents)}
      </div>
    `;
  } catch (error) {
    if (token !== agentsListRenderToken) {
      return;
    }

    const message = error instanceof Error ? error.message : "Failed to load agents";
    renderErrorPage("Agents", message);
  }
}

function renderHealthPage() {
  renderPlaceholder("Health", "Health page");
}

/**
 * Parse the current location hash into a route descriptor.
 * Returns null for empty or unknown paths so the router can redirect.
 */
function parseHashRoute() {
  const rawHash = window.location.hash;
  const path = rawHash.replace(/^#\/?/, "");
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const [section, ...rest] = segments;

  switch (section) {
    case "skills":
      if (rest.length > 0) {
        return {
          name: ROUTE.SKILL_DETAIL,
          params: { name: decodeURIComponent(rest[0]) },
        };
      }
      return { name: ROUTE.SKILLS };
    case "bundles":
      return { name: ROUTE.BUNDLES };
    case "agents":
      return { name: ROUTE.AGENTS };
    case "health":
      return { name: ROUTE.HEALTH };
    default:
      return null;
  }
}

/**
 * Unknown or empty hashes should land on the skills list — the primary entry point.
 */
function redirectToDefaultRoute() {
  window.location.replace(DEFAULT_HASH);
}

/**
 * Highlight the sidebar link that matches the active top-level section.
 */
function updateActiveNav(routeName) {
  const activeHash = NAV_HASH_BY_ROUTE[routeName];

  document.querySelectorAll(".sidebar__link").forEach((link) => {
    const isActive = link.getAttribute("href") === activeHash;
    link.classList.toggle("sidebar__link--active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function dispatchRoute(route) {
  updateActiveNav(route.name);

  switch (route.name) {
    case ROUTE.SKILLS:
      renderSkillsPage();
      break;
    case ROUTE.SKILL_DETAIL:
      renderSkillDetailPage(route.params.name);
      break;
    case ROUTE.BUNDLES:
      renderBundlesPage();
      break;
    case ROUTE.AGENTS:
      renderAgentsPage();
      break;
    case ROUTE.HEALTH:
      renderHealthPage();
      break;
  }
}

/**
 * Normalize the hash before dispatch so initial load always renders after redirect.
 */
function resolveRoute() {
  const hash = window.location.hash;
  let route = parseHashRoute();

  if (!hash || hash === "#" || hash === "#/" || !route) {
    if (window.location.hash !== DEFAULT_HASH) {
      redirectToDefaultRoute();
    }
    route = parseHashRoute();
  }

  return route ?? { name: ROUTE.SKILLS };
}

function handleRouteChange() {
  dispatchRoute(resolveRoute());
}

/**
 * Populate header store metadata once at startup; counts stay static until reload.
 */
async function loadStoreMetadata() {
  try {
    const store = await fetchJson("/store");
    storeRootEl.textContent = store.rootDir ?? "—";
    storeSkillCountEl.textContent = String(store.skillCount ?? "—");
    storeBundleCountEl.textContent = String(store.bundleCount ?? "—");
  } catch (error) {
    console.error("[dashboard] failed to load store metadata", {
      path: "/store",
      message: error instanceof Error ? error.message : String(error),
    });
    storeRootEl.textContent = "—";
    storeSkillCountEl.textContent = "—";
    storeBundleCountEl.textContent = "—";
  }
}

function init() {
  window.addEventListener("hashchange", handleRouteChange);
  loadStoreMetadata();
  handleRouteChange();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
