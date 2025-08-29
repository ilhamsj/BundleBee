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
  // Disable download buttons when nothing is selected
  const selBtn = document.getElementById("downloadSelected");
  const zipBtn = document.getElementById("downloadZip");
  const disable = state.selected.size === 0;
  if (selBtn) selBtn.disabled = disable;
  if (zipBtn) zipBtn.disabled = disable;
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
  const statusEl = document.getElementById("status");
  if (statusEl) {
    if (view.length === state.assets.length) {
      statusEl.textContent = `Showing ${view.length} assets`;
    } else {
      statusEl.textContent = `Showing ${view.length} of ${state.assets.length} assets`;
    }
  }
  // Hide or show download buttons depending on whether there are entries
  const hasEntries = view.length > 0;
  const selBtn = document.getElementById("downloadSelected");
  const zipBtn = document.getElementById("downloadZip");
  if (selBtn) selBtn.style.display = hasEntries ? "inline-block" : "none";
  if (zipBtn) zipBtn.style.display = hasEntries ? "inline-block" : "none";
  // Also ensure disabled state matches current selection
  const disable = state.selected.size === 0;
  if (selBtn) selBtn.disabled = disable;
  if (zipBtn) zipBtn.disabled = disable;
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
      try {
        media.referrerPolicy = "origin-when-cross-origin";
      } catch (_) {}
      media.onerror = () => tryProxyMediaSrc(media, url);
    } else {
      media = document.createElement("img");
      media.src = url;
      media.loading = "lazy";
      try {
        media.referrerPolicy = "origin-when-cross-origin";
      } catch (_) {}
      media.onerror = () => tryProxyMediaSrc(media, url);
    }

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = truncateUrl(url, 60);
    link.title = url;

    // Meta details similar to popup: dimensions, size, type
    const meta = document.createElement("div");
    meta.style.fontSize = "12px";
    meta.style.color = "#666";
    const parts = [];
    if (typeof asset.width === "number" && typeof asset.height === "number") {
      parts.push(`${asset.width}x${asset.height}`);
    }
    if (typeof asset.sizeBytes === "number") {
      parts.push(`${Math.round(asset.sizeBytes / 1024)} KB`);
    }
    if (asset.type) {
      parts.push(String(asset.type));
    }
    if (parts.length) meta.textContent = parts.join(" • ");

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
    if (parts.length) tile.appendChild(meta);
    tile.appendChild(status);
    frag.appendChild(tile);
  });
  grid.appendChild(frag);
}

async function tryProxyMediaSrc(el, url) {
  if (!el || el.dataset.proxied === "1") return;
  el.dataset.proxied = "1";
  try {
    const data = await fetchAsUint8(url);
    const blob = new Blob([data.buffer], { type: guessMimeFromUrl(url) });
    const objUrl = URL.createObjectURL(blob);
    el.src = objUrl;
  } catch (_) {
    // leave the link for manual open
  }
}

function guessMimeFromUrl(url) {
  const lower = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|ogg)$/.test(lower)) return "video/mp4";
  if (/\.(jpg|jpeg)$/.test(lower)) return "image/jpeg";
  if (/\.(png)$/.test(lower)) return "image/png";
  if (/\.(gif)$/.test(lower)) return "image/gif";
  if (/\.(svg)$/.test(lower)) return "image/svg+xml";
  if (/\.(webp)$/.test(lower)) return "image/webp";
  if (/\.(avif)$/.test(lower)) return "image/avif";
  return "application/octet-stream";
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

// ---- ZIP (store-only) bundling utilities ----
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeUtf8(str) {
  return new TextEncoder().encode(str);
}

function writeUint16LE(buffer, value) {
  buffer.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32LE(buffer, value) {
  buffer.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  );
}

function msToDosDateTime(ms) {
  const d = new Date(ms);
  let year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2); // 2-second resolution
  if (year < 1980) year = 1980;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  return { dosDate, dosTime };
}

function concatUint8Arrays(arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function zipStore(entries) {
  // entries: [{ name: string, data: Uint8Array, crc32: number, size: number }]
  const localParts = [];
  const centralParts = [];
  const utf8Flag = 0x0800; // indicate UTF-8 filenames
  const version = 20; // 2.0
  let offset = 0;
  const now = Date.now();
  const { dosDate, dosTime } = msToDosDateTime(now);

  const localHeaderSig = 0x04034b50;
  const centralHeaderSig = 0x02014b50;
  const endSig = 0x06054b50;

  const localChunks = [];
  const offsets = [];

  for (const e of entries) {
    const nameBytes = encodeUtf8(e.name.replace(/\\\\/g, "/"));
    const lh = [];
    writeUint32LE(lh, localHeaderSig); // local file header sig
    writeUint16LE(lh, version); // version needed
    writeUint16LE(lh, utf8Flag); // general purpose bit flag (UTF-8)
    writeUint16LE(lh, 0); // compression method (store)
    writeUint16LE(lh, dosTime);
    writeUint16LE(lh, dosDate);
    writeUint32LE(lh, e.crc32 >>> 0);
    writeUint32LE(lh, e.size >>> 0); // compressed size
    writeUint32LE(lh, e.size >>> 0); // uncompressed size
    writeUint16LE(lh, nameBytes.length);
    writeUint16LE(lh, 0); // extra length
    const lhArr = new Uint8Array(lh);
    const part = concatUint8Arrays([lhArr, nameBytes, e.data]);
    localChunks.push(part);
    offsets.push(offset);
    offset += part.length;

    // Central directory for this entry
    const ch = [];
    writeUint32LE(ch, centralHeaderSig);
    writeUint16LE(ch, (3 << 8) | 63); // version made by (arbitrary: Unix 3.63)
    writeUint16LE(ch, version); // version needed to extract
    writeUint16LE(ch, utf8Flag);
    writeUint16LE(ch, 0); // method store
    writeUint16LE(ch, dosTime);
    writeUint16LE(ch, dosDate);
    writeUint32LE(ch, e.crc32 >>> 0);
    writeUint32LE(ch, e.size >>> 0);
    writeUint32LE(ch, e.size >>> 0);
    writeUint16LE(ch, nameBytes.length);
    writeUint16LE(ch, 0); // extra length
    writeUint16LE(ch, 0); // file comment length
    writeUint16LE(ch, 0); // disk number start
    writeUint16LE(ch, 0); // internal file attrs
    writeUint32LE(ch, 0); // external file attrs
    writeUint32LE(ch, offsets[offsets.length - 1]); // relative offset
    const chArr = new Uint8Array(ch);
    centralParts.push(concatUint8Arrays([chArr, nameBytes]));
  }

  const localAll = concatUint8Arrays(localChunks);
  const centralAll = concatUint8Arrays(centralParts);

  const end = [];
  writeUint32LE(end, endSig);
  writeUint16LE(end, 0); // number of this disk
  writeUint16LE(end, 0); // disk with start of central dir
  writeUint16LE(end, entries.length);
  writeUint16LE(end, entries.length);
  writeUint32LE(end, centralAll.length);
  writeUint32LE(end, localAll.length); // offset of central dir = size of local area
  writeUint16LE(end, 0); // comment length
  const endArr = new Uint8Array(end);

  const finalBytes = concatUint8Arrays([localAll, centralAll, endArr]);
  return new Blob([finalBytes], { type: "application/zip" });
}

function getReferrerForUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.endsWith("midjourney.com")) return "https://www.midjourney.com/";
  } catch (_) {}
  return undefined;
}

async function fetchAsUint8(url) {
  const ref = getReferrerForUrl(url);
  const res = await fetch(url, {
    mode: "cors",
    credentials: "include",
    referrer: ref,
    referrerPolicy: ref ? "strict-origin-when-cross-origin" : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

function buildZipEntryName(url) {
  // Reuse buildFilename but ensure forward slashes inside zip
  const path = buildFilename(url);
  return path.replace(/\\\\/g, "/");
}

function crc32HexOfString(str) {
  const bytes = new TextEncoder().encode(str);
  const v = crc32(bytes);
  return ("00000000" + v.toString(16)).slice(-8);
}

async function downloadZipSelected() {
  const saveAs = document.getElementById("saveAsToggle").checked;
  const keys = Array.from(state.selected);
  if (!keys.length) return;

  const statusEl = document.getElementById("progressSummary");
  const total = keys.length;
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  const failedUrls = [];
  const update = () => {
    statusEl.textContent = `Preparing ZIP: ${completed}/${total} • Skipped: ${skipped} • Failed: ${failed}`;
  };
  update();

  const concurrency = 4;
  let cursor = 0;
  const entries = new Array(keys.length);
  const usedNames = new Set();

  async function worker() {
    while (cursor < keys.length) {
      const myIndex = cursor++;
      const key = keys[myIndex];
      const asset = state.assets.find((a) => getUrlKey(a) === key);
      if (!asset) {
        failed++;
        update();
        continue;
      }
      if (isStreamingUrl(asset.url)) {
        skipped++;
        update();
        continue;
      }
      try {
        const data = await fetchAsUint8(asset.url);
        const crc = crc32(data);
        let name = buildZipEntryName(asset.url);
        if (usedNames.has(name)) {
          const dot = name.lastIndexOf(".");
          const suffix = crc32HexOfString(asset.url).slice(-6);
          if (dot > -1) {
            name = `${name.slice(0, dot)}__${suffix}${name.slice(dot)}`;
          } else {
            name = `${name}__${suffix}`;
          }
        }
        usedNames.add(name);
        entries[myIndex] = { name, data, crc32: crc, size: data.length };
        completed++;
        update();
      } catch (e) {
        failed++;
        failedUrls.push(asset.url);
        update();
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, keys.length) }, () => worker())
  );

  const filtered = entries.filter(Boolean);
  if (!filtered.length) {
    statusEl.textContent = "Nothing to zip.";
    return;
  }
  const blob = zipStore(filtered);
  const url = URL.createObjectURL(blob);
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const zipName = `AssetExtractor/Assets-${ts.getFullYear()}${pad(
    ts.getMonth() + 1
  )}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(
    ts.getSeconds()
  )}.zip`;
  try {
    await chrome.downloads.download({ url, filename: zipName, saveAs });
    statusEl.textContent = `ZIP download started (${filtered.length} files).`;
  } catch (e) {
    // Fallback: anchor click
    const a = document.createElement("a");
    a.href = url;
    a.download = zipName.split("/").pop();
    document.body.appendChild(a);
    a.click();
    a.remove();
    statusEl.textContent = `ZIP prepared (${filtered.length} files).`;
  }

  // Fallback: download any failed items individually to avoid missing assets
  if (failedUrls.length) {
    statusEl.textContent += ` Falling back for ${failedUrls.length} items...`;
    const concurrency = 3;
    let idx = 0;
    async function workerDl() {
      while (idx < failedUrls.length) {
        const i = idx++;
        const u = failedUrls[i];
        try {
          await downloadOne(u, saveAs);
        } catch (_) {}
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(concurrency, failedUrls.length) }, () =>
        workerDl()
      )
    );
    statusEl.textContent += ` done.`;
  }
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
  const zipBtn = document.getElementById("downloadZip");
  if (zipBtn) zipBtn.addEventListener("click", downloadZipSelected);
  document.getElementById("selectAll").addEventListener("change", (e) => {
    // Avoid re-rendering to preserve media playback; just toggle checkboxes in place
    state.selected.clear();
    const shouldSelect = !!e.target.checked;
    const tiles = document.querySelectorAll(".tile");
    tiles.forEach((tile) => {
      const link = tile.querySelector("a");
      const cb = tile.querySelector('input[type="checkbox"]');
      if (!link || !cb) return;
      const key = link.href;
      if (shouldSelect) {
        state.selected.add(key);
        cb.checked = true;
      } else {
        state.selected.delete(key);
        cb.checked = false;
      }
    });
    updateProgressSummary();
  });
  ["filterType", "minSizeKB", "sortBy", "sortDir"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => renderGrid());
  });
  // Sliders with live labels
  [
    { id: "minWidth", labelId: "minWidthValue" },
    { id: "minHeight", labelId: "minHeightValue" },
  ].forEach(({ id, labelId }) => {
    const el = document.getElementById(id);
    const label = document.getElementById(labelId);
    if (!el) return;
    const update = () => {
      if (label) label.textContent = String(el.value);
      renderGrid();
    };
    el.addEventListener("input", update);
    el.addEventListener("change", update);
    update();
  });
  const resetBtn = document.getElementById("resetFilters");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      const type = document.getElementById("filterType");
      const sortBy = document.getElementById("sortBy");
      const sortDir = document.getElementById("sortDir");
      const minW = document.getElementById("minWidth");
      const minH = document.getElementById("minHeight");
      const minKB = document.getElementById("minSizeKB");
      if (type) type.value = "all";
      if (sortBy) sortBy.value = "none";
      if (sortDir) sortDir.value = "asc";
      if (minW) minW.value = 0;
      if (minH) minH.value = 0;
      if (minKB) minKB.value = "";
      const minWidthValue = document.getElementById("minWidthValue");
      const minHeightValue = document.getElementById("minHeightValue");
      if (minWidthValue) minWidthValue.textContent = "0";
      if (minHeightValue) minHeightValue.textContent = "0";
      renderGrid();
    });
  }
  // Initialize buttons disabled before assets load
  (function primeButtons() {
    const selBtn = document.getElementById("downloadSelected");
    const zipBtn = document.getElementById("downloadZip");
    if (selBtn) selBtn.disabled = true;
    if (zipBtn) zipBtn.disabled = true;
  })();
  loadAssets();
})();

function truncateUrl(url, max) {
  if (url.length <= max) return url;
  const half = Math.floor((max - 3) / 2);
  return url.slice(0, half) + "..." + url.slice(-half);
}
