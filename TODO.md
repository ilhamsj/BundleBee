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

- [ ] Implement `scraper.js` content script that extracts from:
  - [ ] `<img>`, `<video>`, `<source>`, `<picture>` (all nested sources)
  - [ ] CSS `background-image` (computed styles, inline styles)
- [ ] Normalize and deduplicate URLs (prefer absolute URLs; handle `srcset`).
- [ ] Collect lightweight metadata when feasible (type, guessed filename, element tag).
- [ ] Decide behavior for `data:` URLs (include or exclude; default exclude for MVP).
- [ ] Provide an injection path using `chrome.scripting.executeScript` from the popup or service worker.
- [ ] Wire messaging: request from `popup.js` → execute scraper in active tab → return results to popup.
      Acceptance:
- [ ] On typical pages, scraping completes < 1s and returns a non-empty deduped list.
- [ ] No console errors in the page, popup, or service worker.

---

### Phase 2 — Popup UI: Preview & List (MVP)

Notes: Present results, support quick scanning/preview, and click-through.

- [ ] Render grid/list of assets with:
  - [ ] Thumbnail for images (`<img>` with `loading="lazy"`).
  - [ ] Playable preview for videos (`<video controls muted>` minimal).
  - [ ] Fallback label for unsupported previews.
- [ ] Show URL (clickable, truncated visually; full in tooltip).
- [ ] Add basic empty, loading, and error states.
- [ ] Add a button to re-run “Get Assets”.
- [ ] Add “Open All in New Tab” button that opens grid gallery (`gallery.html`).
- [ ] Clicking an item opens viewer tab (`viewer.html?src=<encodedURL>`).
      Acceptance:
- [ ] User can fetch and preview assets from the popup on two different sites.
- [ ] Clicking an item opens a new viewer tab with the selected item.

---

### Phase 3 — Viewer Tab (MVP)

Notes: Dedicated page to inspect a single asset inside a styled container with metadata.

- [ ] Create `viewer.html` and `viewer.js`.
- [ ] Parse `src` from query string; validate it before rendering.
- [ ] Render asset inside a responsive/styled container (max-size, background, padding).
- [ ] Display metadata: URL, type (image/video/background), and dimensions if available.
- [ ] Add “Open Original” link (opens in a new tab).
- [ ] Handle errors (broken URL, blocked by CORS); show fallback message.
      Acceptance:
- [ ] Images and videos render correctly for at least two test pages.
- [ ] Metadata and “Open Original” link are visible and functional.

---

### Phase 3b — Gallery Tab (MVP)

Notes: Open a new extension tab to show all assets in a responsive grid.

- [ ] Create `gallery.html` and `gallery.js`.
- [ ] From popup, implement “Open All in New Tab”:
  - [ ] Stash current asset results (e.g., via `chrome.storage.session.set({ assetList })`).
  - [ ] `chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') })`.
- [ ] In `gallery.js`:
  - [ ] Load assets from `chrome.storage.session.get('assetList')`.
  - [ ] Render a responsive CSS grid (3–5 columns; adjusts with viewport).
  - [ ] Lazy-load thumbnails; videos muted and `playsinline`.
  - [ ] Each tile opens single viewer (`viewer.html?src=<encodedURL>`).
- [ ] Handle empty/error states and large lists (consider virtualization or chunked rendering).
      Acceptance:
- [ ] New tab opens showing all assets in a grid on test pages.
- [ ] Clicking a tile opens the single-asset viewer.
- [ ] Grid renders quickly (< ~1s initial view) and scrolls smoothly.

---

### Phase 4 — Multi-Select & Download (Advanced)

Notes: Allow selecting multiple assets and downloading via Chrome Downloads API; optional ZIP.

- [ ] Add checkbox per asset in the popup list and a “Select All” control.
- [ ] Add “Download Selected” button.
- [ ] Implement one-by-one downloads via `chrome.downloads.download` with sensible filenames.
- [ ] Optional: Add ZIP option using JSZip; stream blobs and export as a single ZIP.
- [ ] Show progress and report failed downloads.
      Acceptance:
- [ ] One-by-one downloads succeed for at least 5 mixed assets.
- [ ] ZIP export (if implemented) contains all selected files and is valid.

---

### Phase 5 — Filtering & Sorting (Advanced)

Notes: Help users focus by narrowing the list.

- [ ] Filter by type: image, video, background, all.
- [ ] Filter by dimensions (min width/height); compute where possible.
- [ ] Filter by file size (best-effort via HEAD requests; respect CORS).
- [ ] Sort by filename, URL, dimensions, or type.
- [ ] Persist filter state in popup (in-memory is fine; no storage required).
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
