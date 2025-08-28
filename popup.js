const statusEl = document.getElementById("status");
const openAllBtn = document.getElementById("openAll");
const filterControls = initFilterControls();

async function stashAssets(assets) {
  try {
    if (chrome.storage?.session?.set) {
      await chrome.storage.session.set({ assetList: assets });
      return "session";
    }
  } catch (e) {
    console.warn("Session storage failed, falling back to local.", e);
  }
  try {
    await chrome.storage.local.set({
      assetList: assets,
      assetListTS: Date.now(),
    });
    return "local";
  } catch (e) {
    console.error("Failed to stash assets to local storage.", e);
    throw e;
  }
}

openAllBtn.addEventListener("click", async () => {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL("gallery.html") });
  } catch (e) {
    console.error(e);
  }
});

document.getElementById("getAssets").addEventListener("click", async () => {
  statusEl.textContent = "Loading assets...";
  openAllBtn.style.display = "none";
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: getAssetsFromPage,
    },
    async (injectionResults) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = "Error: " + chrome.runtime.lastError.message;
        return;
      }

      if (!injectionResults || !injectionResults[0]) {
        statusEl.textContent = "No results returned.";
        return;
      }

      const assets = await enrichAssets(injectionResults[0].result || []);

      if (!Array.isArray(assets) || assets.length === 0) {
        statusEl.textContent = "No assets found on this page.";
        return;
      }

      try {
        const mode = await stashAssets(assets);
        console.log("Stashed assetList to", mode);
      } catch (e) {
        // Already logged; show user-friendly status
        statusEl.textContent = "Assets found but failed to prepare gallery.";
      }

      statusEl.textContent = `Found ${assets.length} assets.`;
      openAllBtn.style.display = "inline-block";

      renderList(assets);
    }
  );
});

function truncateUrl(url, max) {
  if (url.length <= max) return url;
  const half = Math.floor((max - 3) / 2);
  return url.slice(0, half) + "..." + url.slice(-half);
}

function getAssetsFromPage() {
  function isHttpUrl(candidate) {
    return /^https?:\/\//i.test(candidate);
  }

  function stripCssUrlWrapper(val) {
    if (val == null) return "";
    let s = String(val).trim();
    // remove surrounding quotes
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      s = s.slice(1, -1).trim();
    }
    // remove url(...) wrapper
    const urlWrap = s.match(/^url\((.*)\)$/i);
    if (urlWrap) {
      s = urlWrap[1].trim();
      if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
      ) {
        s = s.slice(1, -1).trim();
      }
    }
    return s;
  }

  function extractUrlsFromBackground(bg) {
    const found = [];
    if (!bg || bg === "none") return found;
    // Capture url(...) entries
    const urlRegexGlobal = /url\(\s*(["']?.*?["']?)\s*\)/gi;
    let match;
    while ((match = urlRegexGlobal.exec(bg)) !== null) {
      const raw = stripCssUrlWrapper(match[1]);
      if (raw) found.push(raw);
    }
    // Capture image-set(...) entries that may be quoted without url(...)
    const imageSetRegex = /image-set\(([^)]+)\)/gi;
    let isMatch;
    while ((isMatch = imageSetRegex.exec(bg)) !== null) {
      const inside = isMatch[1];
      const parts = inside.split(",");
      parts.forEach((part) => {
        if (/url\(/i.test(part)) return; // already captured above
        const tokenMatch = part.trim().match(/"([^"]+)"|'([^']+)'|([^\s]+)/);
        const candidate = tokenMatch
          ? tokenMatch[1] || tokenMatch[2] || tokenMatch[3]
          : "";
        const raw = stripCssUrlWrapper(candidate);
        if (raw) found.push(raw);
      });
    }
    // Deduplicate
    return Array.from(new Set(found));
  }

  function toAbsoluteUrl(rawUrl) {
    // Normalize potential CSS url(...) wrappers first
    const normalized = stripCssUrlWrapper(rawUrl);
    try {
      const abs = new URL(normalized, document.baseURI).href;
      return abs;
    } catch (e) {
      return null;
    }
  }

  function parseSrcset(srcset) {
    if (!srcset) return [];
    return srcset
      .split(",")
      .map((part) => part.trim())
      .map((candidate) => {
        const [url] = candidate.split(/\s+/);
        return url;
      })
      .filter(Boolean);
  }

  function guessTypeFromUrl(url) {
    const lower = url.split("?")[0].toLowerCase();
    if (/(\.mp4|\.webm|\.ogg)$/.test(lower)) return "video";
    if (/(\.jpg|\.jpeg|\.png|\.gif|\.svg|\.webp|\.avif)$/.test(lower))
      return "image";
    return "image"; // default to image for backgrounds/others
  }

  function deriveFilenameFromUrl(url) {
    try {
      const u = new URL(url);
      const pathname = u.pathname || "/";
      const last = pathname.split("/").filter(Boolean).pop() || u.hostname;
      return decodeURIComponent(last);
    } catch (e) {
      return url;
    }
  }

  function collectImages() {
    const results = [];
    const imgElements = [...document.querySelectorAll("img")];
    imgElements.forEach((img) => {
      const srcCandidates = [];
      if (img.src) srcCandidates.push(img.src);
      srcCandidates.push(...parseSrcset(img.srcset));
      srcCandidates.forEach((raw) => {
        const abs = toAbsoluteUrl(raw);
        if (!abs) return;
        if (!isHttpUrl(abs)) return;
        results.push({
          url: abs,
          type: "image",
          tag: "IMG",
          filename: deriveFilenameFromUrl(abs),
        });
      });
    });

    // <picture> sources
    const pictureSources = [...document.querySelectorAll("picture source")];
    pictureSources.forEach((source) => {
      const srcCandidates = [];
      if (source.src) srcCandidates.push(source.src);
      srcCandidates.push(...parseSrcset(source.srcset));
      srcCandidates.forEach((raw) => {
        const abs = toAbsoluteUrl(raw);
        if (!abs) return;
        if (!isHttpUrl(abs)) return;
        results.push({
          url: abs,
          type: "image",
          tag: "SOURCE",
          filename: deriveFilenameFromUrl(abs),
        });
      });
    });

    return results;
  }

  function collectVideos() {
    const results = [];
    const videoElements = [...document.querySelectorAll("video")];
    videoElements.forEach((video) => {
      if (video.src) {
        const abs = toAbsoluteUrl(video.src);
        if (abs && isHttpUrl(abs))
          results.push({
            url: abs,
            type: "video",
            tag: "VIDEO",
            filename: deriveFilenameFromUrl(abs),
          });
      }
      video.querySelectorAll("source").forEach((s) => {
        if (!s.src) return;
        const abs = toAbsoluteUrl(s.src);
        if (abs && isHttpUrl(abs))
          results.push({
            url: abs,
            type: "video",
            tag: "SOURCE",
            filename: deriveFilenameFromUrl(abs),
          });
      });
    });
    return results;
  }

  function collectBackgroundImages() {
    const results = [];
    const all = [...document.querySelectorAll("*")];

    all.forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === "none") return;

      const urls = extractUrlsFromBackground(bg);

      urls.forEach((raw) => {
        const abs = toAbsoluteUrl(raw);
        if (!abs) return;
        if (!isHttpUrl(abs)) return;
        results.push({
          url: abs,
          type: "background",
          tag: el.tagName,
          filename: deriveFilenameFromUrl(abs),
        });
      });
    });

    return results;
  }

  // Collect
  const assets = [
    ...collectImages(),
    ...collectVideos(),
    ...collectBackgroundImages(),
  ];

  // Deduplicate by normalized URL
  const seen = new Set();
  const deduped = [];
  for (const asset of assets) {
    const key = asset.url;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(asset);
  }

  return deduped;
}

// Example usage
console.log("Collected assets:", getAssetsFromPage());

// ===== Phase 5: Filtering, Sorting, Enrichment =====
function initFilterControls() {
  const els = {
    type: document.getElementById("filterType"),
    minW: document.getElementById("minWidth"),
    minH: document.getElementById("minHeight"),
    minKB: document.getElementById("minSizeKB"),
    sortBy: document.getElementById("sortBy"),
    sortDir: document.getElementById("sortDir"),
  };
  return els;
}

function applyFiltersAndSorting(assets) {
  const type = filterControls.type?.value || "all";
  const minW = parseInt(filterControls.minW?.value || "0", 10) || 0;
  const minH = parseInt(filterControls.minH?.value || "0", 10) || 0;
  const minBytes =
    (parseInt(filterControls.minKB?.value || "0", 10) || 0) * 1024;
  const sortBy = filterControls.sortBy?.value || "none";
  const dir = (filterControls.sortDir?.value || "asc") === "asc" ? 1 : -1;

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
      const get = (key) => {
        if (key === "filename") return a.filename || "";
        if (key === "url") return a.url || "";
        if (key === "type") return a.type || "";
        if (key === "width")
          return typeof a.width === "number" ? a.width : -Infinity;
        if (key === "height")
          return typeof a.height === "number" ? a.height : -Infinity;
        if (key === "size")
          return typeof a.sizeBytes === "number" ? a.sizeBytes : -Infinity;
        return 0;
      };
      const getB = (key) => {
        if (key === "filename") return b.filename || "";
        if (key === "url") return b.url || "";
        if (key === "type") return b.type || "";
        if (key === "width")
          return typeof b.width === "number" ? b.width : -Infinity;
        if (key === "height")
          return typeof b.height === "number" ? b.height : -Infinity;
        if (key === "size")
          return typeof b.sizeBytes === "number" ? b.sizeBytes : -Infinity;
        return 0;
      };
      const av = get(sortBy);
      const bv = getB(sortBy);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  return filtered;
}

function renderList(assets) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";

  const render = () => {
    const view = applyFiltersAndSorting(assets);
    resultsDiv.innerHTML = "";
    view.forEach((asset) => {
      const { url, type, width, height, sizeBytes } = asset;
      const container = document.createElement("div");
      container.className = "asset";

      let preview;
      if (type === "video") {
        preview = document.createElement("video");
        preview.src = url;
        preview.controls = true;
        preview.autoplay = false;
        preview.preload = "metadata";
        preview.muted = true;
        preview.playsInline = true;
        preview.style.maxWidth = "100%";
        preview.style.maxHeight = "150px";
      } else {
        preview = document.createElement("img");
        preview.src = url;
        preview.loading = "lazy";
        preview.style.maxWidth = "100%";
        preview.style.maxHeight = "150px";
      }

      const link = document.createElement("a");
      link.href = url;
      link.textContent = truncateUrl(url, 60);
      link.title = url;
      link.target = "_blank";

      const meta = document.createElement("div");
      meta.style.fontSize = "11px";
      meta.style.color = "#666";
      const parts = [];
      if (typeof width === "number" && typeof height === "number")
        parts.push(`${width}x${height}`);
      if (typeof sizeBytes === "number")
        parts.push(`${Math.round(sizeBytes / 1024)} KB`);
      meta.textContent = parts.join(" • ");

      container.appendChild(preview || document.createTextNode("(no preview)"));
      container.appendChild(document.createElement("br"));
      container.appendChild(link);
      if (parts.length) container.appendChild(meta);
      resultsDiv.appendChild(container);
    });
  };

  [
    filterControls.type,
    filterControls.minW,
    filterControls.minH,
    filterControls.minKB,
    filterControls.sortBy,
    filterControls.sortDir,
  ].forEach((el) => el && el.addEventListener("change", render));

  render();
}

async function enrichAssets(assets) {
  // Best-effort add width/height for images and size via HEAD where allowed
  const concurrency = 5;
  let idx = 0;
  const out = assets.map((a) => ({ ...a }));

  async function probe(asset, i) {
    try {
      if (asset.type === "image" || asset.type === "background") {
        const dims = await probeImageDimensions(asset.url);
        if (dims) Object.assign(out[i], dims);
      }
      if (asset.type === "video") {
        // Skipping video dimension probing to avoid heavy loads; could add metadata probing later
      }
      const size = await headContentLength(asset.url);
      if (typeof size === "number") out[i].sizeBytes = size;
    } catch (_) {}
  }

  async function worker() {
    while (idx < out.length) {
      const i = idx++;
      await probe(out[i], i);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, out.length) }, () => worker())
  );
  return out;
}

function probeImageDimensions(url) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = function () {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = url;
    } catch (_) {
      resolve(null);
    }
  });
}

async function headContentLength(url) {
  try {
    const res = await fetch(url, { method: "HEAD", mode: "no-cors" });
    // In no-cors, headers may be opaque; fall back to GET request with range?
    const len =
      res.headers && res.headers.get ? res.headers.get("content-length") : null;
    if (len != null) {
      const n = Number(len);
      if (!Number.isNaN(n)) return n;
    }
  } catch (_) {}
  return undefined;
}
