(async function init() {
  const status = document.getElementById("status");
  const grid = document.getElementById("grid");

  try {
    let sessionAssets = [];
    let localAssets = [];
    let localTS = 0;

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
      localTS =
        typeof localGet.assetListTS === "number" ? localGet.assetListTS : 0;
    } catch (_) {}

    const assets = sessionAssets.length ? sessionAssets : localAssets;

    if (!assets.length) {
      status.textContent =
        "No assets found. Return to popup and click Get Assets.";
      return;
    }

    status.textContent = `Showing ${assets.length} assets`;

    const frag = document.createDocumentFragment();

    assets.forEach((asset) => {
      const { url, type } = asset;
      const tile = document.createElement("div");
      tile.className = "tile";

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

      tile.appendChild(media);
      tile.appendChild(link);
      frag.appendChild(tile);
    });

    grid.appendChild(frag);
  } catch (e) {
    console.error(e);
    status.textContent = "Error loading gallery.";
  }
})();

function truncateUrl(url, max) {
  if (url.length <= max) return url;
  const half = Math.floor((max - 3) / 2);
  return url.slice(0, half) + "..." + url.slice(-half);
}
