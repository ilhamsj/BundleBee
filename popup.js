const statusEl = document.getElementById("status");
const openAllBtn = document.getElementById("openAll");

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

      const assets = injectionResults[0].result || [];

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

      assets.forEach((asset) => {
        const { url, type } = asset;
        const container = document.createElement("div");
        container.className = "asset";

        // preview
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
        } else if (type === "image" || type === "background") {
          preview = document.createElement("img");
          preview.src = url;
          preview.loading = "lazy";
          preview.style.maxWidth = "100%";
          preview.style.maxHeight = "150px";
        }

        // clickable link (truncated)
        const link = document.createElement("a");
        link.href = url;
        link.textContent = truncateUrl(url, 60);
        link.title = url;
        link.target = "_blank";

        container.appendChild(
          preview || document.createTextNode("(no preview)")
        );
        container.appendChild(document.createElement("br"));
        container.appendChild(link);
        resultsDiv.appendChild(container);
      });
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
