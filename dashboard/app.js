/**
 * aweskill dashboard — hash router, API utilities, and page placeholders.
 * Full page UI is implemented in separate page-* tasks.
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

/**
 * Minimal page shell shared by placeholder renderers until page-* tasks land.
 */
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

function renderSkillsPage() {
  renderPlaceholder("Skills", "Skills page");
}

function renderSkillDetailPage(name) {
  renderPlaceholder(`Skill: ${name}`, "Loading...");
}

function renderBundlesPage() {
  renderPlaceholder("Bundles", "Bundles page");
}

function renderAgentsPage() {
  renderPlaceholder("Agents", "Agents page");
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
