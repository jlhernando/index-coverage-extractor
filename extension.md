# Chrome Extension Plan: GSC Index Coverage Extractor

## Overview

Transform the existing Node.js CLI script into a Chrome Extension (Manifest V3) that extracts Index Coverage and Sitemap Coverage reports directly from Google Search Console — no login automation needed since the user is already authenticated in their browser.

## Why a Chrome Extension?

| CLI Script (current) | Chrome Extension (proposed) |
|---|---|
| Requires Playwright + system Chrome | Runs in the user's existing browser |
| Must automate Google login (fragile, often blocked) | Uses the user's active GSC session — no login needed |
| Requires Node.js v20+ installed | Zero dependencies — install from Chrome Web Store |
| Runs from terminal with credentials | One-click from any GSC page |
| ~4 npm dependencies | Self-contained, no npm |

The biggest win: **eliminating the login problem entirely**. Google actively blocks automated browser logins, which is the #1 pain point with the CLI script. A Chrome extension runs inside the user's authenticated session.

---

## Architecture

```
gsc-coverage-extractor-extension/
├── manifest.json           # Extension config (MV3)
├── background.js           # Service worker — tab navigation, script injection
├── sidepanel.html          # Side panel UI shell
├── sidepanel.js            # Side panel logic — controls, progress, export
├── sidepanel.css           # Side panel styles
├── content.js              # Content script — DOM extraction functions
├── lib/
│   └── exceljs.min.js      # Bundled ExcelJS for Excel generation
├── utils.js                # Shared utilities (date formatting, CSV, site names)
├── report-names.js         # GSC report ID → human-readable name mapping
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── README.md
```

### Component Responsibilities

**`manifest.json`** — Extension declaration
- Manifest V3
- Permissions: `scripting`, `tabs`, `storage`, `unlimitedStorage`, `downloads`, `sidePanel`, `activeTab`
- Host permissions: `https://search.google.com/search-console/*`
- Content script auto-injection on GSC pages

**`background.js`** — Service Worker (orchestrator)
- Receives commands from the side panel via messaging
- Navigates the active tab to GSC pages (`chrome.tabs.update()`)
- Waits for page load (`chrome.tabs.onUpdated`)
- Injects extraction scripts (`chrome.scripting.executeScript()`)
- Returns extracted data to the side panel
- Triggers file downloads (`chrome.downloads.download()`)

**`sidepanel.html/js/css`** — User Interface
- Shows when user clicks the extension icon on a GSC page
- Displays detected GSC properties
- Property multi-select with search/filter
- Report type toggles (coverage, sitemaps, or both)
- Start/Stop extraction controls
- Real-time progress bar with report counts
- Export buttons (Excel, CSV)
- Extraction history/log
- Keeps a long-lived port to the service worker to prevent timeout

**`content.js`** — DOM Extraction (injected into GSC pages)
- Auto-detects current GSC property from the page
- Extracts report IDs from all `script[nonce]` blocks
- Extracts URL lists from report pages (`.OOHai` selector)
- Extracts sitemap lists and coverage data
- Uses `MutationObserver` to wait for SPA content to render
- Sends data back to the service worker via `chrome.runtime.sendMessage()`

**`utils.js`** — Shared utilities (reused from CLI)
- `friendlySiteName()` — URL to filesystem-friendly name
- `formatDate()` — Date parsing and reformatting
- `currentDate()` — Current date in DD-MM-YYYY
- `jsonToCsv()` — Array of objects to CSV string

**`report-names.js`** — Report ID mapping (reused from CLI as-is)

---

## Detailed Implementation Plan

### Phase 1: Project Setup & Manifest

**Goal:** Scaffolding, manifest configuration, extension loads in Chrome.

1. Create new directory `gsc-coverage-extractor-extension/` (separate project)
2. Create `manifest.json`:
   ```json
   {
     "manifest_version": 3,
     "name": "GSC Index Coverage Extractor",
     "description": "Extract Index Coverage and Sitemap Coverage reports from Google Search Console",
     "version": "1.0.0",
     "permissions": [
       "scripting",
       "tabs",
       "storage",
       "unlimitedStorage",
       "downloads",
       "sidePanel",
       "activeTab"
     ],
     "host_permissions": [
       "https://search.google.com/*"
     ],
     "background": {
       "service_worker": "background.js",
       "type": "module"
     },
     "side_panel": {
       "default_path": "sidepanel.html"
     },
     "action": {
       "default_title": "GSC Coverage Extractor",
       "default_icon": {
         "16": "icons/icon-16.png",
         "48": "icons/icon-48.png",
         "128": "icons/icon-128.png"
       }
     },
     "content_scripts": [
       {
         "matches": ["https://search.google.com/search-console/*"],
         "js": ["content.js"],
         "run_at": "document_idle"
       }
     ],
     "icons": {
       "16": "icons/icon-16.png",
       "48": "icons/icon-48.png",
       "128": "icons/icon-128.png"
     }
   }
   ```
3. Create placeholder files for all components
4. Create extension icons (simple GSC-themed icon)
5. Copy `utils.js` and `report-names.js` from CLI project
6. Bundle `exceljs.min.js` into `lib/`
7. Test: Load unpacked extension in Chrome, verify it appears in toolbar

### Phase 2: Side Panel UI

**Goal:** Working side panel with property detection, controls, and progress display.

1. **`sidepanel.html`** — Clean, minimal UI:
   - Header with extension name and version
   - Status indicator (connected to GSC / not on GSC page)
   - Property list section with search input and checkboxes
   - Options: toggle coverage extraction, toggle sitemap extraction
   - Settings: date format (European/American)
   - "Start Extraction" / "Stop" button
   - Progress section: current property, current report, progress bar, URL count
   - Export section: "Download Excel" / "Download CSV" buttons
   - Log/history section showing extraction steps

2. **`sidepanel.css`** — Styling:
   - Match Google's Material Design aesthetic (since it sits next to GSC)
   - Light/clean with GSC-like blues and grays
   - Responsive within the side panel width (~400px)
   - Progress bar with animation
   - Status badges (green = ready, yellow = extracting, red = error)

3. **`sidepanel.js`** — Logic:
   - On load: check if active tab is a GSC page
   - If on GSC: send message to content script to detect properties
   - Populate property checklist with search/filter
   - Handle Start button: open long-lived port to service worker, begin extraction loop
   - Handle Stop button: send abort signal, clean up
   - Listen to `chrome.storage.onChanged` for progress updates
   - Handle Export buttons: generate Excel/CSV from stored data, trigger download

### Phase 3: Content Script — DOM Extraction

**Goal:** Extract data from GSC pages reliably, handling SPA rendering.

1. **Auto-detection on GSC pages:**
   ```js
   // Detect if we're on the GSC welcome page with property list
   function detectProperties() {
     const scripts = Array.from(document.querySelectorAll('script[nonce]'), el => el.text);
     const sites = scripts.filter(s => s.includes('ds:1'))[1];
     if (!sites) return [];
     const regex = /((?:http|sc-domain)[^"]+)/g;
     const matches = [...sites.matchAll(regex)];
     const clean = new Set();
     for (const m of matches) {
       if (!m[0].includes('google.com')) clean.add(m[0]);
     }
     return Array.from(clean);
   }
   ```

2. **Wait for SPA content to render:**
   ```js
   function waitForElement(selector, timeout = 15000) {
     return new Promise((resolve, reject) => {
       const existing = document.querySelector(selector);
       if (existing) return resolve(existing);
       const observer = new MutationObserver(() => {
         const el = document.querySelector(selector);
         if (el) { observer.disconnect(); resolve(el); }
       });
       observer.observe(document.body, { childList: true, subtree: true });
       setTimeout(() => { observer.disconnect(); reject(new Error('Timeout')); }, timeout);
     });
   }
   ```

3. **Extract report IDs** (scan all script blocks — the fix we just made):
   ```js
   function extractReportIDs(property) {
     const scripts = Array.from(document.querySelectorAll('script[nonce]'), el => el.text);
     const regex = new RegExp(`"${property}",13,"([^"]+)"`, 'g');
     const ids = new Set();
     for (const script of scripts) {
       for (const match of script.matchAll(regex)) ids.add(match[1]);
     }
     return Array.from(ids);
   }
   ```

4. **Extract URLs from a report page:**
   ```js
   function extractReportUrls(category) {
     const updated = document.querySelector('.zTJZxd.zOPr2c')?.innerText ?? 'No date';
     return Array.from(document.querySelectorAll('.OOHai')).map(url => ({
       status: category,
       'report name': document.querySelector('.Iq9klb')?.innerText ?? 'No name',
       url: url.innerText.replace(/[\uE14D\uE89E\uE8B6]/g, ''),
       updated: updated.replace(/[^\d|\/]+/g, ''),
     }));
   }
   ```

5. **Extract sitemap data** (list, coverage numbers, individual URLs)

6. **Message passing:** Content script listens for commands from service worker:
   ```js
   chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
     if (msg.action === 'detectProperties') sendResponse(detectProperties());
     if (msg.action === 'extractReportIDs') sendResponse(extractReportIDs(msg.property));
     if (msg.action === 'extractReportUrls') sendResponse(extractReportUrls(msg.category));
     return true; // Keep channel open for async response
   });
   ```

### Phase 4: Background Service Worker — Orchestration

**Goal:** Navigate tabs, coordinate extraction, manage state.

1. **Open side panel on extension icon click:**
   ```js
   chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
   ```

2. **Tab navigation helper:**
   ```js
   async function navigateAndWait(tabId, url) {
     await chrome.tabs.update(tabId, { url });
     return new Promise(resolve => {
       function listener(id, info) {
         if (id === tabId && info.status === 'complete') {
           chrome.tabs.onUpdated.removeListener(listener);
           resolve();
         }
       }
       chrome.tabs.onUpdated.addListener(listener);
     });
   }
   ```

3. **Inject and extract:**
   ```js
   async function extractFromPage(tabId, func, args = []) {
     // Wait for SPA content after navigation
     await chrome.scripting.executeScript({
       target: { tabId },
       func: waitForElement,
       args: ['.OOHai', 10000]
     });
     // Extract data
     const results = await chrome.scripting.executeScript({
       target: { tabId },
       func,
       args
     });
     return results[0]?.result;
   }
   ```

4. **Extraction loop** (driven by messages from side panel):
   ```js
   chrome.runtime.onConnect.addListener(port => {
     if (port.name !== 'scraping') return;
     port.onMessage.addListener(async msg => {
       if (msg.action === 'startExtraction') {
         const { tabId, properties, options } = msg;
         for (const property of properties) {
           // Navigate to index coverage page
           // Extract report IDs
           // Loop through reports, extract URLs
           // Store results incrementally
           // Send progress updates to side panel via port
           port.postMessage({ type: 'progress', property, report, count });
         }
         port.postMessage({ type: 'complete' });
       }
     });
   });
   ```

5. **Keep-alive via long-lived port:** The side panel maintains the port connection. If it disconnects (5-min Chrome limit), the side panel reconnects automatically.

### Phase 5: Export (Excel & CSV)

**Goal:** Generate and download Excel/CSV files from extracted data.

1. **Excel generation in side panel** (has full DOM access):
   ```js
   async function generateExcel(data) {
     const workbook = new ExcelJS.Workbook();
     // Create tabs per property (same logic as CLI)
     for (const [property, reports] of Object.entries(data)) {
       const { file, short } = friendlySiteName(property);
       createExcelTab(reports.summary, workbook, `${short}_SUM`);
       createExcelTab(reports.coverage, workbook, `${short}_COV`);
       if (reports.sitemapSummary) createExcelTab(reports.sitemapSummary, workbook, `${short}_SUM_MAPS`);
       if (reports.sitemapUrls) createExcelTab(reports.sitemapUrls, workbook, `${short}_MAPS`);
     }
     // Generate and download
     const buffer = await workbook.xlsx.writeBuffer();
     const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
     const url = URL.createObjectURL(blob);
     chrome.downloads.download({
       url,
       filename: `index-results_${currentDate()}.xlsx`,
       saveAs: true
     });
   }
   ```

2. **CSV generation** (reuse `jsonToCsv()` from utils.js):
   ```js
   function downloadCsv(data, filename) {
     const csv = jsonToCsv(data);
     const blob = new Blob([csv], { type: 'text/csv' });
     const url = URL.createObjectURL(blob);
     chrome.downloads.download({ url, filename, saveAs: true });
   }
   ```

### Phase 6: Polish & Error Handling

1. **GSC page detection** — Grey out extension icon when not on a GSC page
2. **Error recovery** — If a page fails to load, retry once, then skip with warning
3. **Rate limiting** — 2-3 second delay between page navigations to avoid Google throttling
4. **Progress persistence** — Save extraction state to `chrome.storage.session` so it survives service worker restarts
5. **Abort handling** — User can stop extraction mid-way, keeping data extracted so far
6. **Empty report handling** — Skip reports with 0 URLs gracefully
7. **Tab visibility warning** — Warn if the GSC tab is minimized (throttled JS execution)

### Phase 7: Testing & Distribution

1. **Manual testing** — Test with multiple GSC accounts and property types (domain, URL prefix)
2. **Edge cases** — Properties with 0 reports, properties with many sitemaps, 2-digit years, American dates
3. **Chrome Web Store** — Package as .zip, create store listing, submit for review
4. **Privacy policy** — Required for Web Store. The extension accesses GSC data but stores nothing externally.

---

## Data Flow Diagram

```
User clicks extension icon on GSC page
         │
         ▼
   ┌─────────────┐
   │  Side Panel  │ ◄── User selects properties & clicks Start
   └──────┬──────┘
          │ long-lived port
          ▼
   ┌─────────────┐
   │  Background  │ ── chrome.tabs.update() ──► Navigate GSC tab
   │  (Service    │
   │   Worker)    │ ── chrome.scripting.executeScript() ──┐
   └──────┬──────┘                                        │
          │                                               ▼
          │                                    ┌──────────────────┐
          │                                    │  Content Script   │
          │                                    │  (injected into   │
          │                                    │   GSC page DOM)   │
          │                                    └────────┬─────────┘
          │                                             │
          │ ◄── extracted data (URLs, report IDs) ──────┘
          │
          ▼
   chrome.storage.local.set() ──► Persisted results
          │
          ▼
   Side Panel updates progress UI
          │
          ▼
   User clicks "Download Excel"
          │
          ▼
   ExcelJS generates .xlsx in side panel
          │
          ▼
   chrome.downloads.download() ──► File saved to disk
```

---

## What Can Be Reused from the CLI

| CLI File | Extension Reuse | Notes |
|---|---|---|
| `utils.js` | Direct copy | `friendlySiteName`, `formatDate`, `currentDate`, `jsonToCsv` — all pure functions |
| `report-names.js` | Direct copy | Static mapping, no changes needed |
| `index.js` DOM extraction logic | Refactor into `content.js` | The `page.evaluate()` callbacks are essentially content script functions already |
| `index.js` Excel generation | Refactor into `sidepanel.js` | `createExcelTab` logic moves to the side panel |
| CSS selectors (`.OOHai`, `.Iq9klb`, etc.) | Direct copy | Same GSC DOM being scraped |

## What's New (extension-only)

- `manifest.json` — Extension configuration
- `background.js` — Service worker orchestration
- `sidepanel.html/js/css` — Complete UI
- `content.js` — Message-based DOM extraction
- Tab navigation via `chrome.tabs` (replaces Playwright `page.goto()`)
- `MutationObserver` waiting (replaces Playwright's `waitFor()`)
- `chrome.storage` for state (replaces in-memory arrays)
- `chrome.downloads` for file export (replaces `fs.writeFile`)

---

## Settings (user-configurable in side panel)

| Setting | Default | Description |
|---|---|---|
| Extract sitemaps | `true` | Include sitemap coverage data |
| Date format | European (DD/MM/YYYY) | Toggle between European and American |
| Convert dates | `false` | Convert American dates to European in output |
| Delay between pages | 3 seconds | Adjustable to avoid rate limiting |
| Auto-download on complete | `true` | Automatically trigger Excel download when done |

---

## Estimated Effort

| Phase | Description | Complexity |
|---|---|---|
| Phase 1 | Setup & manifest | Low |
| Phase 2 | Side panel UI | Medium |
| Phase 3 | Content script extraction | Medium — core logic exists, needs MutationObserver wrapping |
| Phase 4 | Service worker orchestration | Medium-High — tab navigation + keepalive + state |
| Phase 5 | Excel/CSV export | Low — reuse existing logic |
| Phase 6 | Error handling & polish | Medium |
| Phase 7 | Testing & distribution | Medium |

---

## Key Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| GSC changes CSS selectors | Extraction breaks | Selectors are already fragile in CLI; same risk. Can update extension via Chrome Web Store. |
| Service worker timeout during long extraction | Extraction stops mid-way | Long-lived port from side panel keeps it alive. Save progress incrementally to storage. |
| Google rate-limits rapid page navigation | 429 errors | Configurable delay between pages (default 3s). Exponential backoff on errors. |
| ExcelJS bundle size | Extension too large | ExcelJS min is ~1MB. Acceptable for extension. Could offer CSV-only mode. |
| Chrome Web Store review | Rejection for host permissions | GSC-specific host permission is narrow and justified. Clear privacy policy. |
