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
        let assets = injectionResults[0].result;
        assets.forEach((url) => {
          let container = document.createElement("div");
          container.className = "asset";

          // clickable link
          let link = document.createElement("a");
          link.href = url;
          link.textContent = url;
          link.target = "_blank"; // open in new tab

          // preview
          let preview;
          if (url.match(/\.(mp4|webm|ogg)$/i)) {
            preview = document.createElement("video");
            preview.src = url;
            preview.controls = true;
            preview.style.maxWidth = "100%";
            preview.style.maxHeight = "150px";
          } else if (url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) {
            preview = document.createElement("img");
            preview.src = url;
            preview.style.maxWidth = "100%";
            preview.style.maxHeight = "150px";
          }

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
  // 1. Grab all <img> sources
  const images = [...document.querySelectorAll("img")].map((img) => img.src);

  // 2. Grab all <video> sources
  const videos = [...document.querySelectorAll("video")].flatMap((video) => {
    const srcs = [];
    if (video.src) srcs.push(video.src);
    video.querySelectorAll("source").forEach((s) => s.src && srcs.push(s.src));
    return srcs;
  });

  // 3. Grab background images from inline styles and computed styles
  const bgImages = [...document.querySelectorAll("*")].flatMap((el) => {
    const styles = getComputedStyle(el).backgroundImage;

    if (!styles || styles === "none") return [];

    // handle simple url("...") or url('...') or url(...)
    const urlRegex = /url\(["']?(.*?)["']?\)/g;
    const urls = [];
    let match;
    while ((match = urlRegex.exec(styles)) !== null) {
      urls.push(match[1]);
    }

    // handle image-set(...) inside background-image
    const imageSetRegex = /image-set\((.*?)\)/g;
    while ((match = imageSetRegex.exec(styles)) !== null) {
      const set = match[1]
        .split(",")
        .map((item) => item.trim().split(" ")[0].replace(/["']/g, ""));
      urls.push(...set);
    }

    return urls;
  });

  // 4. Remove duplicates
  return [...new Set([...images, ...videos, ...bgImages])];
}

// Example usage
console.log(getAssetsFromPage());
