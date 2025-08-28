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
  selected: new Set(),
  inProgress: new Map(),
  completed: new Map(),
  failed: new Map(),
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

function renderGrid() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  state.assets.forEach((asset, index) => {
    const { url, type } = asset;
    const tile = document.createElement("div");
    tile.className = "tile";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selected.has(index);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selected.add(index);
      else state.selected.delete(index);
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
  const indices = Array.from(state.selected);
  const tiles = document.querySelectorAll(".tile");
  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < indices.length) {
      const myIndex = cursor++;
      const assetIndex = indices[myIndex];
      const asset = state.assets[assetIndex];
      const tile = tiles[assetIndex];
      const statusEl = tile.querySelector(".dl-status");
      statusEl.textContent = "Queued...";

      try {
        statusEl.textContent = "Starting...";
        const downloadId = await downloadOne(asset.url, saveAs);
        state.inProgress.set(assetIndex, downloadId);
        updateProgressSummary();
      } catch (e) {
        state.failed.set(assetIndex, String(e && e.message ? e.message : e));
        const msg = String(e && e.message ? e.message : e);
        statusEl.textContent = `Failed: ${msg}`;
        updateProgressSummary();
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, indices.length) },
    () => worker()
  );
  await Promise.all(workers);
}

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta || typeof delta.id !== "number") return;
  // map download id to asset index
  for (const [assetIndex, downloadId] of state.inProgress.entries()) {
    if (downloadId === delta.id) {
      const tile = document.querySelectorAll(".tile")[assetIndex];
      const statusEl = tile && tile.querySelector(".dl-status");
      if (!statusEl) continue;
      if (delta.state && delta.state.current) {
        const s = delta.state.current;
        if (s === "in_progress") statusEl.textContent = "Downloading...";
        if (s === "complete") {
          statusEl.textContent = "Done";
          state.inProgress.delete(assetIndex);
          state.completed.set(assetIndex, true);
          updateProgressSummary();
        }
        if (s === "interrupted") {
          const reason = (delta.error && delta.error.current) || "interrupted";
          statusEl.textContent = `Failed: ${reason}`;
          state.inProgress.delete(assetIndex);
          state.failed.set(assetIndex, reason);
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
    if (e.target.checked) {
      for (let i = 0; i < state.assets.length; i++) state.selected.add(i);
    }
    renderGrid();
    updateProgressSummary();
  });
  loadAssets();
})();

function truncateUrl(url, max) {
  if (url.length <= max) return url;
  const half = Math.floor((max - 3) / 2);
  return url.slice(0, half) + "..." + url.slice(-half);
}
