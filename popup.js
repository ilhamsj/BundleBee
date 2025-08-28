document.getElementById("getAssets").addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: getAssetsFromPage,
    },
    (injectionResults) => {
      const resultsDiv = document.getElementById("results");
      resultsDiv.innerHTML = "";

      if (injectionResults && injectionResults[0].result) {
        const assets = injectionResults[0].result;
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

          // clickable link
          const link = document.createElement("a");
          link.href = url;
          link.textContent = url;
          link.target = "_blank";

          container.appendChild(
            preview || document.createTextNode("(no preview)")
          );
          container.appendChild(document.createElement("br"));
          container.appendChild(link);
          resultsDiv.appendChild(container);
        });
      }
    }
  );
});

function getAssetsFromPage() {
  function isHttpUrl(candidate) {
    return /^https?:\/\//i.test(candidate);
  }

  function toAbsoluteUrl(rawUrl) {
    try {
      const abs = new URL(rawUrl, document.baseURI).href;
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
    const urlRegex = /url\(["']?(.*?)["']?\)/g;
    const imageSetRegex = /image-set\((.*?)\)/g;

    all.forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === "none") return;

      const urls = [];
      let match;

      // url(...) patterns
      while ((match = urlRegex.exec(bg)) !== null) {
        if (match[1]) urls.push(match[1]);
      }

      // image-set(...) patterns
      let isMatch;
      while ((isMatch = imageSetRegex.exec(bg)) !== null) {
        const inside = isMatch[1];
        const parts = inside.split(",");
        parts.forEach((item) => {
          const first = item.trim().split(" ")[0].replace(/["']/g, "");
          if (first) urls.push(first);
        });
      }

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
