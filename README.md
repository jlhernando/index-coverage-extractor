# Google Search Console Index Coverage Extractor

This script allows users of Google Search Console (GSC) to extract all the different reports from the [Index Coverage report section](https://support.google.com/webmasters/answer/7440203?hl=en) of the platform and the [Sitemap Coverage report section](https://support.google.com/webmasters/answer/7451001?hl=en&ref_topic=9456557). I wrote a blog post about [why I built this script](https://jlhernando.com/blog/index-coverage-extractor/).

## Installing and running the script

The script uses the ECMAScript modules import/export syntax so double check that you are above version 20 to run the script.

```bash
# Check Node version
node -v
```

After downloading/cloning the repo, install the necessary modules to run the script.

```bash
npm install
```

After that you can run the script with _npm start_ command from your terminal.

```bash
npm start
```

You will get a prompt message in your terminal asking for your Google Account email address and your password (masked input). This is to login automatically through the browser.

If you have 2-step Verification enabled it will prompt a warning message and wait for 30 seconds to give the user time to verify access through one of your devices.

Once verified and logged in, the script will extract all the list of GSC properties present in your account. At this point you will have to choose which properties you would like to extract data from.

Select one or multiple properties using the spacebar. Move up and down using the arrow keys.

When this is done, your will see the processing messages in your terminal while the script runs.

### Available commands

| Command | Description |
|---------|-------------|
| `npm start` | Run the extractor |
| `npm test` | Run unit tests (29 tests) |
| `npm run reset` | Clear browser session (to switch Google accounts) |

## Output

The script will create a "index-results\_{date}.xlsx" Excel file. The file will contain 1 summary tab with the number of Indexed URLs per property when you choose more than 1 property and up to 4 tabs per property including:

- A summary of the index coverage extraction of the property.
- The individual URLs extracted from the Coverage section.
- A summary of the index coverage extraction from the Sitemap section.
- The individual URLs extracted from the Sitemap section.

The "sitename\_COV" tab and the "coverage.csv" file will contain all the URLs that have been extracted from each individual coverage report. If you have requested a domain property the tab in Excel and the CSV will be preceded by DOM.

The "sitename\_SUM" tab and the "summary.csv" file will contain the amount of urls per report that have been extracted, the total number that GSC reports in the user interface (either the same or higher) and an "extraction ratio" which is a division between the URLs extracted and the total number of URLs reported by GSC.

This is useful because GSC has an export limit of 1000 rows per report. Hence, the "extraction ratio" may be small compared to the total amount of total URLs within a specific report.

The "sitename\_MAPS" tab and the "sitemap.csv" file will contain all the URLs that have been extracted from each individual sitemap coverage report.

The "sitename\_SUM\_MAPS" tab and the "sum-sitemap.csv" file will contain a summary of the top-level coverage numbers per sitemap reported by GSC.

## Additional optional settings

### _credentials.js File_

#### Email & Password

You can choose to fill in the `credentials.js` file with your email and password to avoid adding them in the terminal during the running of the script.

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

The script uses a persistent Chrome profile stored in `chrome-profile/` directory. After your first login, the session is saved automatically — you won't need to log in again on subsequent runs.

If you use multiple Google accounts or need to re-login, run:

```bash
npm run reset
```

### Headless

In some cases you might want to see how the browser automation is happening in real-time. For that, you can change the `headless` variable.

```js
// Change to false to see the automation
const headless = false;
```

### sitemapExtract

Since each GSC property can contain many sitemaps and this can take more time, you can choose whether you would like to extract sitemap coverage data or not.

```js
// Change to false to prevent the script from extracting sitemap coverage data
const sitemapExtract = false;
```

### Dates

The script extracts the "Latest updated" dates that GSC provides. Hence the date can be in two different formats: American date (mm/dd/yyyy) and European date (dd/mm/yyyy). Therefore there is an option to set which date format you would like the script to output the dates.

The default setting assumes your property shows the dates in European date format (dd/mm/yyyy). If your GSC property shows the dates in American date format then you would need to change `americanDate = true`. Also if your property is in American date format but you'd like to change it to European date format you can do that by changing `americanDateChange = true`.

## Changelog

### v3.0.0

- **Reduced dependencies from 8 to 4**: Removed `moment`, `json2csv`, `fs`, and `path` npm packages. Date formatting and CSV conversion now use lightweight native utilities (`utils.js`).
- **Updated Playwright** from v1.30.0-alpha to v1.50+ and switched from Firefox to system Chrome for better Google login compatibility.
- **Replaced chalk with ansis**: Same API with hex color support, 7x smaller (15KB vs 101KB).
- **Replaced enquirer + readline with @clack/prompts**: Modern terminal UI with masked password input, input validation, and multiselect with box-drawing UI.
- **Persistent Chrome profile**: Replaced `cookies.json` with a persistent browser profile (`chrome-profile/`) for reliable session persistence.
- **Sign-in rejection handling**: Detects when Google blocks the automated browser and provides clear troubleshooting steps.
- **Fixed Playwright deprecations**: Replaced `type()` with `pressSequentially()`, `waitForSelector()` with `locator.waitFor()`, `waitForTimeout()` with native `setTimeout`.
- **Added unit tests** (29 tests) for utility functions using Node.js built-in test runner.

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
