# Google Search Console Index Coverage Extractor

This script allows users of Google Search Console (GSC) to extract all the different reports from the [Index Coverage report section](https://support.google.com/webmasters/answer/7440203?hl=en) of the platform and the [Sitemap Coverage report section](https://support.google.com/webmasters/answer/7451001?hl=en&ref_topic=9456557). I wrote a blog post about [why I built this script](https://jlhernando.com/blog/index-coverage-extractor/).

## How it works

The script automates a Chrome browser to log into Google Search Console and extract index coverage data. Here's the flow:

1. **Login** — Launches a persistent Chrome session. If you're already logged in (session saved), it skips the login step. Otherwise, it prompts for your Google email and password with support for 2-Step Verification.
2. **Property selection** — Extracts all GSC properties from your account and presents a searchable multi-select picker (type to filter, spacebar to select).
3. **Report extraction** — For each selected property, navigates to the Index Coverage page, discovers available report IDs from the page source, and extracts URLs from each report (up to GSC's 1,000-row export limit per report).
4. **Sitemap extraction** _(optional)_ — Discovers all sitemaps for the property, then extracts coverage data and individual URLs from each sitemap's reports.
5. **Output** — Generates an Excel file with summary and detail tabs per property, plus individual CSV files organized in folders per property.

## Installing and running the script

The script uses ECMAScript modules (ESM) import/export syntax. Node.js v20+ is required.

```bash
# Check Node version
node -v
```

After downloading/cloning the repo, install the necessary modules to run the script.

```bash
npm install
```

After that you can run the script with the _npm start_ command from your terminal.

```bash
npm start
```

### Available commands

| Command | Description |
|---------|-------------|
| `npm start` | Run the extractor |
| `npm test` | Run unit tests (30 tests) |
| `npm run reset` | Clear browser session (to switch Google accounts) |

## Output

The script creates an `index-results_{date}.xlsx` Excel file. The file will contain 1 summary tab with the number of Indexed URLs per property when you choose more than 1 property and up to 4 tabs per property:

- **sitename\_SUM** — Summary of the index coverage extraction: URLs extracted vs total reported by GSC, with extraction ratio.
- **sitename\_COV** — Individual URLs extracted from each coverage report. Domain properties are preceded by `DOM`.
- **sitename\_SUM\_MAPS** — Top-level coverage numbers (indexed / not indexed) per sitemap.
- **sitename\_MAPS** — Individual URLs extracted from sitemap coverage reports.

CSV files with the same data are also created in a folder named after each property:

- `coverage_{site}_{date}.csv`
- `summary_{site}_{date}.csv`
- `sitemaps-{site}_{date}.csv`
- `sum-sitemaps-{site}_{date}.csv`

> **Note:** GSC has an export limit of 1,000 rows per report. The summary's "extraction ratio" shows how much of the total was captured — it may be small for reports with many URLs.

## Project structure

```
├── index.js            # Main script — browser automation, extraction logic, Excel/CSV output
├── credentials.js      # Optional pre-filled Google credentials and site list
├── report-names.js     # Maps GSC internal report IDs to human-readable names
├── utils.js            # Utility functions: date formatting, CSV conversion, site name helpers
├── test/
│   └── utils.test.js   # 30 unit tests for utils.js (Node.js built-in test runner)
├── chrome-profile/     # Persistent Chrome session data (gitignored, created on first run)
└── package.json
```

## Dependencies

| Package | Purpose |
|---------|---------|
| [playwright](https://playwright.dev) | Browser automation — launches Chrome, navigates GSC, extracts data |
| [@clack/prompts](https://github.com/bombshell-dev/clack) | Terminal UI — text/password inputs, searchable multi-select, spinners, progress |
| [ansis](https://github.com/nicedoc/ansis) | Terminal colors — lightweight chalk replacement (15KB vs 101KB) |
| [exceljs](https://github.com/exceljs/exceljs) | Excel file generation with multiple tabs and table formatting |

## Configuration

### credentials.js

#### Email & Password

You can fill in the `credentials.js` file with your email and password to avoid entering them in the terminal each time.

#### Sites

Verified GSC properties can be added in the `credentials.js` file. You can add them as a single string for only 1 property OR as an array for multiple properties.

Remember that if you want to extract data from a Domain Property you should add `sc-domain:` in front of the domain (_sc-domain:yourdomain.com_).

```js
// Single property
const site = 'https://yoursite.com/';

// OR Multiple properties
const site = ['https://yoursite.com/', 'sc-domain:yourdomain.com'];
```

### Session persistence

The script uses a persistent Chrome profile stored in `chrome-profile/`. After your first login, the session is saved automatically — you won't need to log in again on subsequent runs.

If you need to switch Google accounts or re-login:

```bash
npm run reset
```

### Headless mode

By default the browser runs in headless mode (hidden). To watch the automation in real-time, change the `headless` variable in `index.js`:

```js
const headless = false;
```

### Sitemap extraction

Since each GSC property can contain many sitemaps and this can take more time, you can disable sitemap extraction:

```js
const sitemapExtract = false;
```

### Date format

The script prompts you to choose your preferred date format at startup:

- **DD/MM/YYYY** — European format (default)
- **MM/DD/YYYY** — American format
- **YYYY-MM-DD** — ISO format

GSC dates are automatically detected regardless of your locale (US or EU) and reformatted to your chosen format.

## Changelog

### v3.1.1

- **Non-Latin character support**: Properties with accented characters (é, ñ, ü), Cyrillic, CJK, or other non-ASCII characters in their URLs now work correctly. `friendlySiteName` replaces non-ASCII chars with underscores for safe filesystem paths. Consecutive underscores are collapsed.
- **Regex escaping fix**: Report ID extraction now escapes regex-special characters (dots, brackets, etc.) in property names before building the search regex. Previously, dots in domain names were treated as wildcard matchers, and unusual characters could break extraction entirely.
- **Safe Unicode truncation**: Excel tab name truncation now uses `Array.from()` instead of `.slice()` to avoid splitting surrogate pairs in Unicode strings.
- **4 new unit tests** for non-Latin character handling in `friendlySiteName` (accented, Cyrillic, CJK, underscore collapsing). Total: 30 tests.

### v3.1.0

- **Multi-account support**: Automatically detects `/u/N/` URL prefix for users with multiple Google accounts. All GSC navigation now preserves the account context.
- **Graceful error handling**: If extraction fails midway (timeout, network error, etc.), partial results are saved to `index-results_PARTIAL_{date}.xlsx` instead of being lost. Individual property failures no longer crash the entire run.
- **Sitemap early-stop**: Stops extracting sitemaps after 3 consecutive empty ones, avoiding unnecessary requests and Google rate limits (429 errors).
- **Google error page detection**: Detects 500/429 error pages via DOM inspection after each navigation. Previously the script would silently continue extracting from error pages.
- **Configurable date format**: Interactive prompt to choose between DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD. Replaces the old `americanDate`/`americanDateChange` boolean settings. GSC dates are auto-detected regardless of locale.
- **Robust count parsing**: Extracts real numbers from GSC's `title` attribute (e.g., `title="848,275"`) with K/M/B suffix fallback. Fixes the old single-comma `.replace(',', '')` bug that broke numbers over 999,999.

### v3.0.0

- **Reduced dependencies from 8 to 4**: Removed `moment`, `json2csv`, `fs`, and `path` npm packages. Date formatting and CSV conversion now use lightweight native utilities (`utils.js`).
- **Updated Playwright** from v1.30.0-alpha to v1.50+ and switched from Firefox to system Chrome for better Google login compatibility.
- **Persistent Chrome profile**: Replaced `cookies.json` with a persistent browser profile (`chrome-profile/`) for reliable session persistence.
- **Replaced chalk with ansis**: Same API with hex color support, 7x smaller (15KB vs 101KB).
- **Replaced enquirer + readline with @clack/prompts**: Modern terminal UI with searchable multi-select, masked password input, spinners, and progress indicators.
- **Sign-in rejection handling**: Detects when Google blocks the automated browser and provides clear troubleshooting steps.
- **Spinners and progress counters**: All long-running operations show spinners with `[1/N]` progress. 2FA shows a countdown timer.
- **Fixed report ID extraction**: Scans all script blocks for report IDs instead of hardcoded `ds:11`/`ds:13`, which Google had moved. Previously missed all not-indexed report categories. Inspired by PR #4 from @hanicker.
- **Fixed Playwright deprecations**: Replaced `type()` with `pressSequentially()`, `waitForSelector()` with `locator.waitFor()`, `waitForTimeout()` with native `setTimeout`.
- **Added unit tests** (29 tests) for utility functions using Node.js built-in test runner.
- **Error handling**: `try/finally` wrapper ensures browser cleanup on unexpected errors.

### v2.1.0

- Added headless mode enabled by default.
- Fixed bug throwing Excel error when only 1 property was chosen.
- Improved login process with more descriptive messages and better 2-factor auth process.
- Included cookies saving to reduce number of logins when using the same account.

### v2.0.0

- Multiple properties support.
- Credentials from terminal prompts.
- Extract specific reports instead of looping through all.
- Colour messaging in terminal.
- Optional sitemap extraction.
- Excel output with summary and property tabs.

## Reports extracted

### Indexed

- [x] All Indexed URLs

#### (Old Warning reports)

- [x] Indexed, though blocked by robots.txt
- [x] Page indexed without content

### Not indexed

- [x] Excluded by 'noindex' tag
- [x] Blocked by page removal tool
- [x] Blocked by robots.txt
- [x] Blocked due to unauthorized request (401)
- [x] Crawled - currently not indexed
- [x] Discovered - currently not indexed
- [x] Alternate page with proper canonical tag
- [x] Duplicate without user-selected canonical
- [x] Duplicate, Google chose different canonical than user
- [x] Not found (404)
- [x] Page with redirect
- [x] Soft 404
- [x] Duplicate, submitted URL not selected as canonical
- [x] Blocked due to access forbidden (403)
- [x] Blocked due to other 4xx issue

#### (Old Error report)

- [x] Server error (5xx)
- [x] Redirect error
- [x] Submitted URL blocked by robots.txt
- [x] Submitted URL marked 'noindex'
- [x] Submitted URL seems to be a Soft 404
- [x] Submitted URL has crawl issue
- [x] Submitted URL not found (404)
- [x] Submitted URL returned 403
- [x] Submitted URL returns unauthorized request (401)
- [x] Submitted URL blocked due to other 4xx issue
