## TODO — Chrome Extension: Asset Extractor

This checklist is organized by phases. Each phase includes notes and acceptance criteria.

---

### Phase 0 — Project Setup (MV3)

Notes: Establish baseline MV3 scaffolding and dev ergonomics.

- [ ] Confirm `manifest_version: 3` and basic fields in `manifest.json` (name, version, description).
- [ ] Define `action` with `default_popup` set to `popup.html`.
- [ ] Add `service_worker` (e.g., `background.js`) under `background` in the manifest.
- [ ] Add icons (16, 32, 48, 128) and update `icons` in manifest.
- [ ] Permissions: `activeTab`, `scripting`, `downloads`.
- [ ] Host permissions: `http://*/*`, `https://*/*` (or narrower if desired).
- [ ] If using `chrome.storage.session`, add `storage` permission.
- [ ] Set a strict CSP (default MV3 is fine; avoid inline scripts).
- [ ] Add basic dev commands to README for loading the unpacked extension and reloading.
      Acceptance:
- [ ] Extension loads without errors in `chrome://extensions`.
- [ ] Popup opens from the toolbar.

---

### Phase 1 — Asset Extraction Engine (MVP)

Notes: Inject a scraper into the active tab and gather asset URLs + basic metadata.
Note: Implemented inline via `chrome.scripting.executeScript` for now; can be extracted to `scraper.js` later.

- [x] Implement `scraper.js` content script that extracts from:
  - [x] `<img>`, `<video>`, `<source>`, `<picture>` (all nested sources)
  - [x] CSS `background-image` (computed styles, inline styles)
- [x] Normalize and deduplicate URLs (prefer absolute URLs; handle `srcset`).
- [x] Collect lightweight metadata when feasible (type, guessed filename, element tag).
- [x] Decide behavior for `data:` URLs (include or exclude; default exclude for MVP).
- [x] Provide an injection path using `chrome.scripting.executeScript` from the popup or service worker.
- [x] Wire messaging: request from `popup.js` → execute scraper in active tab → return results to popup.
      Acceptance:
- [x] On typical pages, scraping completes < 1s and returns a non-empty deduped list.
- [x] No console errors in the page, popup, or service worker.

---

### Phase 2 — Popup UI: Preview & List (MVP)

Notes: Present results, support quick scanning/preview, and click-through.

- [x] Render grid/list of assets with:
  - [x] Thumbnail for images (`<img>` with `loading="lazy"`).
  - [x] Video previews (`<video controls muted preload="metadata" playsinline>`; no autoplay).
  - [x] Fallback label for unsupported previews.
- [x] Show URL (clickable, truncated visually; full in tooltip).
- [x] Add basic empty, loading, and error states.
- [x] Add a button to re-run “Get Assets”.
- [x] Add “Open All in New Tab” button that opens grid gallery (`gallery.html`).
      Acceptance:
- [x] User can fetch and preview assets from the popup on two different sites.
- [x] “Open All in New Tab” opens the gallery with current results.

---

### Phase 3 — Gallery (Primary Inspection Surface, MVP)

Notes: New tab that shows all assets in a responsive grid. Tiles open originals.

- [x] Create `gallery.html` and `gallery.js`.
- [x] From popup, implement “Open All in New Tab”:
  - [x] Stash current asset results (e.g., via `chrome.storage.session.set({ assetList })`).
  - [x] `chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') })`.
- [x] In `gallery.js`:
  - [x] Load assets from `chrome.storage.session.get('assetList')`.
  - [x] Render a responsive CSS grid (3–5 columns; adjusts with viewport).
  - [x] Lazy-load thumbnails; videos muted, `preload="metadata"`, `playsinline`.
  - [x] Each tile opens the original asset URL in a new tab.
- [ ] Handle empty/error states and large lists (consider virtualization or chunked rendering).
      Acceptance:
- [x] New tab opens showing all assets in a grid on test pages.
- [x] Clicking a tile opens the original asset in a new browser tab.
- [x] Grid renders quickly (< ~1s initial view) and scrolls smoothly.

---

### Phase 3b — (Cancelled) Viewer Tab

Notes: Replaced by gallery as primary surface. If needed later, implement as optional overlay.

- [ ] Cancelled.

---

### Phase 4 — Multi-Select & Download (Advanced)

Notes: Allow selecting multiple assets and downloading via Chrome Downloads API; optional ZIP later. Prefer multi-select in `gallery.html` for space and persistence.

- [ ] Add checkbox per asset and a "Select All" control (primarily in `gallery.html`).
- [ ] Add "Download Selected" with two modes:
  - [x] Quick download: auto-save to default Downloads using structured `filename` (e.g., `AssetExtractor/{domain}/...`).
  - [x] Save As: set `saveAs: true` to let the user pick folder/filename via the system dialog.
- [x] Implement one-by-one downloads via `chrome.downloads.download` with deterministic, sanitized filenames.
- [x] Limit concurrency (3–5) and queue remaining; handle throttling.
- [x] Show persistent progress per item and report failures (e.g., in gallery list).
- [ ] Optional (later): ZIP using JSZip or streaming ZIP; enforce size/item caps and graceful abort.
      Acceptance:
- [x] One-by-one downloads succeed for at least 10 images and non-streaming videos.
- [ ] When "Save As" is enabled, user can choose the destination folder via dialog.
- [x] Clear per-item success/failure state is visible after completion in the gallery.
- [x] Filenames are deterministic, collision-free, and organized by domain when auto-saving.
- [x] Select All works; queue is limited to 3 concurrent downloads.
- [x] Streaming formats (e.g., .m3u8/.mpd) are skipped with a clear message.
- [ ] If ZIP is implemented, archive validates and respects size (e.g., 200 MB) and count caps.

---

### Phase 5 — Filtering & Sorting (Advanced)

Notes: Help users focus by narrowing the list.

- [x] Filter by type: image, video, background, all.
- [x] Filter by dimensions (min width/height); compute where possible.
- [x] Filter by file size (best-effort via HEAD requests; respect CORS).
- [x] Sort by filename, URL, dimensions, or type.
- [x] Persist filter state in popup (in-memory is fine; no storage required).
      Acceptance:
- [ ] Filters change the visible list as expected.
- [ ] Sorting applies without performance regressions (>95% responsiveness preserved).

---

### Phase 6 — Export (Advanced)

Notes: Export asset lists for external use.

- [ ] Export to CSV (URL, type, width, height if known).
- [ ] Export to JSON (include all collected metadata).
- [ ] Download files with consistent filenames and UTF-8 encoding.
      Acceptance:
- [ ] CSV and JSON exports open correctly and contain expected records.

---

### Cross-Cutting: Quality, Performance, Accessibility

Notes: Keep the experience fast, clear, and robust.

- [ ] Performance: end-to-end “Get Assets” in < 1s on typical pages.
- [ ] Dedup accuracy: same asset not shown twice (normalize query strings where appropriate).
- [ ] Error handling: user-friendly messages on failures/timeouts.
- [ ] Accessibility: keyboard navigation in popup; focus states; semantic HTML.
- [ ] Visual polish: spacing, truncation, hover states; Dark mode (optional/future).
- [ ] Security: no eval/unsafeInline; avoid storing user data; validate URLs before use.

---

### Docs, Testing, and Release

Notes: Ensure the project is easy to run, test, and ship.

- [ ] Update `README.md` with setup, permissions rationale, and usage.
- [ ] Add a simple manual test plan (sample sites: news site, e-commerce PDP, blog).
- [ ] Verify no errors in the service worker and popup consoles during tests.
- [ ] Bump manifest `version` for each packaged release.
- [ ] Prepare Chrome Web Store listing assets and copy (name, description, screenshots).
- [ ] Package a ZIP with only required files; verify install from ZIP.
- [ ] Add `LICENSE` and ensure icons/assets licensing is clear.

---

### Future Considerations (Backlog)

Notes: Nice-to-haves beyond MVP.

- [ ] Support audio assets (`<audio>`, `<source>`).
- [ ] Lazy-loaded assets: MutationObserver/scroll to discover more.
- [ ] Gallery mode in viewer (next/previous across assets).
- [ ] Firefox support via WebExtensions API.

---

### Phase Mapping to PRD

- Phase 1–3: PRD “Core Features (MVP)” — Get Assets, Popup Preview, Viewer Tab, All-Assets Grid.
- Phase 4–6: PRD “Advanced Features” — Multi-Select & Download, Filtering, Export, Sorting.
- Cross-Cutting, Docs/Testing/Release map to PRD Technical Requirements and Success Metrics.
