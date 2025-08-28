// Simple filename util: sanitize and add domain folder
function buildFilename(url) {
  try {
    const u = new URL(url);
    const domain = u.hostname.replace(/[^a-z0-9.-]/gi, "_");
    const last = decodeURIComponent(
      u.pathname.split("/").filter(Boolean).pop() || domain
    );
    const clean = last.replace(/[^a-z0-9._-]/gi, "_");
    return `AssetExtractor/${domain}/${clean || "file"}`;
  } catch (_) {
    return `AssetExtractor/unknown/file`;
  }
}

function isStreamingUrl(url) {
  const lower = url.split("?")[0].toLowerCase();
  return /(\.m3u8|\.mpd)$/.test(lower);
}

function truncateUrl(url, max) {
  if (url.length <= max) return url;
  const half = Math.floor((max - 3) / 2);
  return url.slice(0, half) + "..." + url.slice(-half);
}

const state = {
  assets: [],
  selected: new Set(), // stores URL keys for stability
  inProgress: new Map(), // urlKey -> downloadId
  completed: new Set(), // urlKey
  failed: new Map(), // urlKey -> reason
};

function updateProgressSummary() {
  const el = document.getElementById("progressSummary");
  if (!el) return;
  const total = state.selected.size;
  const done = state.completed.size;
  const failed = state.failed.size;
  const active = state.inProgress.size;
  if (!total) {
    el.textContent = "";
  } else {
    el.textContent = `Selected: ${total} • In progress: ${active} • Done: ${done} • Failed: ${failed}`;
  }
}

function getUrlKey(asset) {
  return asset.url;
}

function applyFiltersAndSorting(assets) {
  const type = document.getElementById("filterType")?.value || "all";
  const minW =
    parseInt(document.getElementById("minWidth")?.value || "0", 10) || 0;
  const minH =
    parseInt(document.getElementById("minHeight")?.value || "0", 10) || 0;
  const minKB =
    parseInt(document.getElementById("minSizeKB")?.value || "0", 10) || 0;
  const minBytes = minKB * 1024;
  const sortBy = document.getElementById("sortBy")?.value || "none";
  const dir =
    (document.getElementById("sortDir")?.value || "asc") === "asc" ? 1 : -1;

  let filtered = assets.filter((a) => {
    if (type !== "all" && a.type !== type) return false;
    if (minW && (typeof a.width !== "number" || a.width < minW)) return false;
    if (minH && (typeof a.height !== "number" || a.height < minH)) return false;
    if (minBytes && (typeof a.sizeBytes !== "number" || a.sizeBytes < minBytes))
      return false;
    return true;
  });

  if (sortBy !== "none") {
    filtered.sort((a, b) => {
      const get = (obj, key) => {
        if (key === "filename") return obj.filename || "";
        if (key === "url") return obj.url || "";
        if (key === "type") return obj.type || "";
        if (key === "width")
          return typeof obj.width === "number" ? obj.width : -Infinity;
        if (key === "height")
          return typeof obj.height === "number" ? obj.height : -Infinity;
        if (key === "size")
          return typeof obj.sizeBytes === "number" ? obj.sizeBytes : -Infinity;
        return 0;
      };
      const av = get(a, sortBy);
      const bv = get(b, sortBy);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  return filtered;
}

function renderGrid() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  const view = applyFiltersAndSorting(state.assets);
  view.forEach((asset, index) => {
    const { url, type } = asset;
    const tile = document.createElement("div");
    tile.className = "tile";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const key = getUrlKey(asset);
    checkbox.checked = state.selected.has(key);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selected.add(key);
      else state.selected.delete(key);
      updateProgressSummary();
    });

    let media;
    if (type === "video") {
      media = document.createElement("video");
      media.src = url;
      media.controls = true;
      media.autoplay = false;
      media.preload = "metadata";
      media.muted = true;
      media.playsInline = true;
    } else {
      media = document.createElement("img");
      media.src = url;
      media.loading = "lazy";
    }

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = truncateUrl(url, 60);
    link.title = url;

    const status = document.createElement("div");
    status.style.fontSize = "12px";
    status.style.color = "#666";
    status.className = "dl-status";
    if (state.completed.has(key)) status.textContent = "Done";
    else if (state.failed.has(key))
      status.textContent = `Failed: ${state.failed.get(key)}`;

    tile.appendChild(checkbox);
    tile.appendChild(media);
    tile.appendChild(link);
    tile.appendChild(status);
    frag.appendChild(tile);
  });
  grid.appendChild(frag);
}

async function loadAssets() {
  const statusEl = document.getElementById("status");
  try {
    let sessionAssets = [];
    let localAssets = [];

    try {
      const sessionGet =
        (await chrome.storage?.session?.get("assetList")) || {};
      sessionAssets = Array.isArray(sessionGet.assetList)
        ? sessionGet.assetList
        : [];
    } catch (_) {}

    try {
      const localGet =
        (await chrome.storage?.local?.get(["assetList", "assetListTS"])) || {};
      localAssets = Array.isArray(localGet.assetList) ? localGet.assetList : [];
    } catch (_) {}

    state.assets = sessionAssets.length ? sessionAssets : localAssets;
    if (!state.assets.length) {
      statusEl.textContent =
        "No assets found. Return to popup and click Get Assets.";
      return;
    }
    statusEl.textContent = `Showing ${state.assets.length} assets`;
    renderGrid();
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Error loading gallery.";
  }
}

async function downloadOne(url, saveAs) {
  if (isStreamingUrl(url)) {
    throw new Error("Streaming format not supported (.m3u8/.mpd)");
  }
  const filename = buildFilename(url);
  const id = await chrome.downloads.download({ url, filename, saveAs });
  return id;
}

async function downloadSelected() {
  const saveAs = document.getElementById("saveAsToggle").checked;
  const keys = Array.from(state.selected);
  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < keys.length) {
      const myIndex = cursor++;
      const key = keys[myIndex];
      const asset = state.assets.find((a) => getUrlKey(a) === key);
      if (!asset) continue;

      // update UI status for this asset if visible
      const tiles = document.querySelectorAll(".tile");
      for (const tile of tiles) {
        const link = tile.querySelector("a");
        if (link && link.href === asset.url) {
          const statusEl = tile.querySelector(".dl-status");
          if (statusEl) statusEl.textContent = "Queued...";
          break;
        }
      }

      try {
        const downloadId = await downloadOne(asset.url, saveAs);
        state.inProgress.set(key, downloadId);
        updateProgressSummary();
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        state.failed.set(key, msg);
        // reflect failure in UI if visible
        const tiles = document.querySelectorAll(".tile");
        for (const tile of tiles) {
          const link = tile.querySelector("a");
          if (link && link.href === asset.url) {
            const statusEl = tile.querySelector(".dl-status");
            if (statusEl) statusEl.textContent = `Failed: ${msg}`;
            break;
          }
        }
        updateProgressSummary();
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, keys.length) },
    () => worker()
  );
  await Promise.all(workers);
}

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta || typeof delta.id !== "number") return;
  // map download id to asset index
  for (const [key, downloadId] of state.inProgress.entries()) {
    if (downloadId === delta.id) {
      // update tile matching this key if visible
      let statusEl = null;
      const tiles = document.querySelectorAll(".tile");
      for (const tile of tiles) {
        const link = tile.querySelector("a");
        if (link && link.href === key) {
          statusEl = tile.querySelector(".dl-status");
          break;
        }
      }
      if (!statusEl) continue;
      if (delta.state && delta.state.current) {
        const s = delta.state.current;
        if (s === "in_progress") statusEl.textContent = "Downloading...";
        if (s === "complete") {
          statusEl.textContent = "Done";
          state.inProgress.delete(key);
          state.completed.add(key);
          updateProgressSummary();
        }
        if (s === "interrupted") {
          const reason = (delta.error && delta.error.current) || "interrupted";
          statusEl.textContent = `Failed: ${reason}`;
          state.inProgress.delete(key);
          state.failed.set(key, reason);
          updateProgressSummary();
        }
      }
    }
  }
});

(function init() {
  document
    .getElementById("downloadSelected")
    .addEventListener("click", downloadSelected);
  document.getElementById("selectAll").addEventListener("change", (e) => {
    state.selected.clear();
    if (e.target.checked)
      state.assets.forEach((a) => state.selected.add(getUrlKey(a)));
    renderGrid();
    updateProgressSummary();
  });
  [
    "filterType",
    "minWidth",
    "minHeight",
    "minSizeKB",
    "sortBy",
    "sortDir",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => renderGrid());
  });
  loadAssets();
})();

function truncateUrl(url, max) {
  if (url.length <= max) return url;
  const half = Math.floor((max - 3) / 2);
  return url.slice(0, half) + "..." + url.slice(-half);
}
