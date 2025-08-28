# 📄 PRD: Chrome Extension – Asset Extractor

## 1. Overview

A Chrome extension that allows users to **extract, preview, filter, view, and download** image and video assets from any webpage. The extension provides both a **popup interface** for quick browsing and a **dedicated viewer tab** for full inspection of each asset.

---

## 2. Goals

- Provide an easy way to **list all image and video URLs** from a page.
- Allow **previewing** assets directly in the extension popup.
- Support a **dedicated viewer tab** for inspecting a single asset in a container (not just raw asset).
- Enable **bulk selection & downloading** of assets.
- Add **filtering capabilities** (by file type, size, or dimensions).

---

## 3. Target Users

- **Designers**: extract and preview high-resolution assets for reference.
- **Developers**: debug frontend implementations or CDN assets.
- **Content creators**: collect multiple images/videos for inspiration or reuse.

---

## 4. Features

### **Core Features (MVP)**

1. **Get Assets**

   - Extract from `<img>`, `<video>`, `<source>`, `<picture>`, and CSS `background-image`.
   - Deduplicate URLs.

2. **Preview Assets in Popup**

   - Display thumbnails for images.
   - Display playable video previews.
   - Show fallback text if preview unavailable.

3. **Open in Viewer Tab**

   - Clicking an asset opens a **new extension tab (`viewer.html`)**.
   - The viewer tab includes:

     - Asset rendered inside a styled container.
     - Metadata (URL, type, dimensions if possible).
     - Direct link to original asset (open in browser tab).

4. **Open All in New Tab (Gallery)**

   - From the popup, user can open a gallery tab (`gallery.html`) showing all extracted assets in a responsive grid.
   - Each item is clickable to open the single-asset viewer (`viewer.html`).
   - Handles large lists efficiently (lazy loading/chunked rendering).

---

### **Advanced Features (Phase 2–3)**

4. **Multi-Select & Download**

   - Checkbox next to each asset in popup.
   - “Download Selected” button.
   - Download as:

     - **One-by-one** (Chrome downloads API).
     - **Single ZIP** (via JSZip).

5. **Filtering**

   - By **File Type**: image, video, background, or all.
   - By **Dimensions** (width/height).
   - By **File Size** (if retrievable via headers).

6. **Export**

   - Export asset URLs to **CSV** or **JSON**.

7. **Sorting**

   - Sort by filename, URL, dimension, or type.

---

## 5. User Flow

1. User opens a website.
2. User clicks the **extension icon** → popup opens.
3. Extension **auto-fetches assets** (or user clicks "Get Assets").
4. Assets are displayed with:

   - Thumbnail / video preview.
   - URL (clickable).
   - Checkbox for selection.

5. User actions:

   - **Click “Open All in New Tab”** → opens gallery tab with grid of all collected assets.
   - **Click “Open in Viewer”** → opens new extension tab with full preview + metadata.
   - **Select some assets** → click “Download Selected” → gets ZIP or individual downloads.
   - **Apply filters** → e.g., only images > 500px wide.
   - **Export asset list** → CSV/JSON.

---

## 6. Technical Requirements

- **Chrome Extension Manifest v3**
- Permissions:

  - `activeTab` (read current page assets)
  - `scripting` (inject asset scraper)
  - `downloads` (save files)
  - `storage` (optional; ephemeral handoff via `chrome.storage.session`)

- Popup UI: HTML/CSS/JS
- Viewer UI: `viewer.html` + `viewer.js` (for rendering + metadata)
- Gallery UI: `gallery.html` + `gallery.js` (responsive grid showing all assets)
- ZIP generation: [JSZip](https://stuk.github.io/jszip/)
- Storage: none (no user data). May use `chrome.storage.session` for in-memory handoff.

---

## 7. Success Metrics

- **Functional**: Extracts >95% of visible image/video assets on a page.
- **Usability**: User can extract, inspect, and download within 3 clicks.
- **Performance**: Asset extraction runs in <1 second on typical pages.

---

## 8. Future Considerations

- Support for **audio files** (`<audio>`, `source`).
- Support for **lazy-loaded assets** (scroll detection or MutationObserver).
- Dark mode UI.
- **Gallery mode in viewer tab** (next/previous navigation across assets).
- Support for **Firefox** (via WebExtensions API).

---

## 9. Feasibility Review (Senior Dev)

- Core: Get Assets
  - :check Extract from `<img>`, `<video>`, `<source>`, `<picture>`
  - :check Extract CSS `background-image` URLs (computed styles; ignore gradients/data URIs)
  - :check Deduplicate URLs (normalize to absolute; consider stripping hashes)
- Preview in Popup
  - :check Image thumbnails (lazy-loaded)
  - :check Video previews (muted/controls; autoplay depends on user gesture/policy)
  - :check Fallback text for unsupported previews
- Open in Viewer Tab
  - :check `viewer.html` with styled container and metadata (image `naturalWidth/Height`, video `videoWidth/Height`)
  - :check Direct link to original asset (opens in new tab)
- Open All in New Tab (Gallery)
  - :check `gallery.html` responsive grid; recommend virtualization for 300+ items
  - :check Handoff via `chrome.storage.session` (ephemeral; MV3)
- Multi-Select & Download
  - :check One-by-one via `chrome.downloads.download` (public URLs; auth-protected may fail)
  - :check ZIP via JSZip (requires fetching blobs; needs `host_permissions`; large memory usage risk)
- Filtering
  - :check By type (image/video/background)
  - :check By dimensions (measure lazily; background images expensive to measure)
  - :x By file size via headers is unreliable due to CORS; treat as best-effort/optional
- Export
  - :check CSV and JSON of URLs + metadata
- Sorting

  - :check By filename/URL/type
  - :check By dimensions (after measurement; may be missing for some assets)

- Technical Requirements

  - :check MV3 manifest and base permissions (`activeTab`, `scripting`, `downloads`)
  - :check Optional `storage` for `chrome.storage.session`
  - :check Popup/Viewer/Gallery HTML/CSS/JS
  - :check ZIP via JSZip (mind CORS/host permissions and memory)

- Success Metrics

  - :check Functional >95% extraction (backgrounds/lazy assets may reduce; acceptable for MVP)
  - :check Usability within ~3 clicks (popup → gallery/viewer → action)
  - :check Performance <1s typical pages (heavy pages may exceed; optimize and lazy-load)

- Future Considerations
  - :check Audio assets support
  - :check Lazy-loaded assets via `MutationObserver`
  - :check Dark mode UI
  - :check Gallery next/previous navigation
  - :check Firefox via WebExtensions (minor API differences; MV3 support improving)
