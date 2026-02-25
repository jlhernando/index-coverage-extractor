/* Modules */
import { email, pass, site } from './credentials.js'; // Import Google Search Credentials - EDIT CREDENTIALS.JS
import { writeFile, mkdir } from 'fs/promises'; // Module to access the File System - Extract only ones needed
import { existsSync } from 'fs'; // File System sync
import { chromium } from 'playwright'; // Uses system Chrome for best Google login compatibility
import { reportsNames } from './report-names.js'; // Custom array of objects with specific params to access GSC reports
import { friendlySiteName, formatDate, currentDate, jsonToCsv } from './utils.js'; // Utility functions
import Excel from 'exceljs'; // Create Excel docs in JS
import * as clack from '@clack/prompts'; // Modern terminal prompts (text, password, multiselect, spinner)
import ansis from 'ansis'; // Terminal colors (lightweight chalk replacement)

/* Settings */
const headless = false; // Whether you want to see the browser automation (false) or run hidden (true) - Default true
const sitemapExtract = true; // Whether you want to extract data from sitemaps or not - Default true
const sites = []; // Holding array for GSC properties
const indexedSum = []; // Holding array for summary of indexed URLs from all GSC properties
const reportSelector = '.OOHai'; // CSS Selector from report Urls
const reportTitle = '.Iq9klb'; // CSS Selector to extract report name from sitemap coverage reports
const reportStatus = '.DDFhO'; // CSS Selector to extract report status from sitemap coverage reports
const profilePath = './chrome-profile'; // Persistent Chrome profile directory — stores cookies, sessions, etc.
const gscHomepage = 'https://search.google.com/search-console/welcome?hl=en'; // GSC Homepage URL
let gscPathPrefix = ''; // Multi-account prefix (e.g., '/u/0') detected from current GSC URL
const MAX_CONSECUTIVE_EMPTY = 3; // Stop sitemap extraction after N consecutive empty sitemaps

/**
 * Escape special regex characters in a string for safe use in `new RegExp(...)`.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a GSC URL with multi-account prefix support.
 */
function buildGscUrl(resource, page, extraParams = {}) {
  const base = `https://search.google.com${gscPathPrefix}/search-console/${page}`;
  const params = new URLSearchParams({ resource_id: resource, ...extraParams });
  return `${base}?${params.toString()}`;
}

/**
 * Detect /u/N/ prefix from the current page URL for multi-account support.
 */
function detectGscPrefix(url) {
  const match = url?.match(/search\.google\.com(\/u\/\d+)\/search-console/);
  gscPathPrefix = match?.[1] || '';
}

/**
 * Check if the page is a Google error page (500, 429, etc.) via DOM inspection.
 */
async function checkForGoogleError(page) {
  const error = await page.evaluate(() => {
    const bodyText = document.body?.innerText || '';
    const title = document.title || '';
    const errorMatch = bodyText.match(/(\d{3})\.\s*That'?s an error/i);
    if (errorMatch) return { error: true, code: errorMatch[1], message: `Google ${errorMatch[1]} error` };
    if (/Error\s+\d{3}/.test(title)) {
      const code = title.match(/\d{3}/)?.[0] || 'unknown';
      return { error: true, code, message: `Google error (${code})` };
    }
    if (bodyText.includes('Too Many Requests') || /rate.?limit/i.test(bodyText)) {
      return { error: true, code: '429', message: 'Google rate limit (429)' };
    }
    return { error: false };
  });
  if (error.error) throw new Error(error.message);
}

/**
 * Navigate to a URL and check for Google error pages.
 */
async function navigateAndCheck(page, url) {
  await page.goto(url);
  await checkForGoogleError(page);
}

/**
 * Parse a GSC date string (locale-dependent) into a Date object.
 * Disambiguates US (M/D/YY) vs EU (D/M/YY) by checking if any part > 12.
 */
function parseGscDateStr(dateStr) {
  if (!dateStr || dateStr === 'No date') return null;
  const clean = dateStr.replace(/[^\d/\-\.]/g, '').trim();
  const parts = clean.split(/[/\-\.]/);
  if (parts.length !== 3) return null;
  let [a, b, c] = parts.map(Number);
  if (c < 100) c += 2000;
  let d;
  if (a > 12) d = new Date(c, b - 1, a);
  else if (b > 12) d = new Date(c, a - 1, b);
  else d = new Date(c, a - 1, b); // Ambiguous → assume US (MM/DD)
  return isNaN(d.getTime()) ? null : d;
}

// Asynchronous IIFE
(async () => {
  clack.intro(ansis.bgCyanBright(' GSC Index Coverage Extractor v3.1.1 '));

  let context;
  let totalUrls = 0;
  let workbook;

  try {
    // Setup browser with persistent profile (avoids Google detecting automation)
    const s = clack.spinner();
    s.start('Launching browser...');

    context = await chromium.launchPersistentContext(profilePath, {
      headless: headless,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });

    let page = context.pages()[0] || (await context.newPage());
    s.stop('Browser launched.');

    // Helper: check if Google blocked the sign-in as "unsafe browser"
    const checkSignInRejected = async () => {
      if (page.url().includes('/signin/rejected')) {
        clack.log.error('Google blocked the sign-in: "This browser or app may not be secure."');
        clack.log.warning('Try the following:');
        clack.log.warning('  1. Run: npm run reset (then npm start)');
        clack.log.warning('  2. Set headless = false in index.js to manually complete the login');
        clack.log.warning('  3. If using 2FA, try generating an app-specific password');
        await context.close();
        process.exit(1);
      }
    };

    // Check if already logged in by visiting a page that requires authentication
    s.start('Checking login status...');
    await page.goto(gscHomepage);
    await new Promise((r) => setTimeout(r, 2000)); // Wait for redirects to settle
    checkSignInRejected();
    let loggedIn = false;

    try {
      await page.getByText('Welcome to Google Search Console').waitFor({ state: 'visible', timeout: 3000 });
      s.stop('Already logged in.');
      loggedIn = true;
    } catch (error) {
      s.stop('Not logged in.');

      // Find and submit Email input
      let gmail = '';

      try {
        if (!email) {
          gmail = await clack.text({
            message: 'Input your Google Account email:',
            validate: (v) => (v.length === 0 ? 'Email is required' : undefined),
          });
          if (clack.isCancel(gmail)) {
            clack.cancel('Cancelled.');
            await context.close();
            process.exit();
          }
        } else gmail = email;

        s.start('Submitting email...');
        await page.getByRole('textbox', { name: 'Email or phone' }).pressSequentially(gmail, { delay: 50 });
        await page.keyboard.press('Enter');

        await page.waitForResponse((resp) =>
          resp.url().includes('https://accounts.google.com/v3/signin/_/AccountsSignInUi/'),
        );
        checkSignInRejected();
        if (await page.getByText('Couldn\u2019t find your Google Account').isVisible()) {
          s.stop('Email rejected.');
          clack.log.error('Google couldn\u2019t find your Google Account. Check the email and try again.');
          await context.close();
          process.exit();
        }
        s.stop('Email accepted.');
      } catch (error) {
        checkSignInRejected();
        clack.log.error('There was an issue submitting your email address. Please check it and try again.');
        await context.close();
        process.exit();
      }

      // Find and submit Password input
      let password = '';

      try {
        if (!pass) {
          password = await clack.password({
            message: 'Input your Google Account password:',
            validate: (v) => (v.length === 0 ? 'Password is required' : undefined),
          });
          if (clack.isCancel(password)) {
            clack.cancel('Cancelled.');
            await context.close();
            process.exit();
          }
        } else password = pass;

        s.start('Submitting password...');
        await page.getByRole('textbox', { name: 'Enter your password' }).pressSequentially(password, { delay: 50 });
        await page.keyboard.press('Enter');

        await page.waitForResponse((resp) =>
          resp.url().includes('https://accounts.google.com/v3/signin/_/AccountsSignInUi/'),
        );
        checkSignInRejected();
        if (await page.getByText('Wrong password').isVisible()) {
          s.stop('Password rejected.');
          clack.log.error('Wrong password. Run the script and try again.');
          await context.close();
          process.exit();
        }
        s.stop('Password accepted.');

        await new Promise((r) => setTimeout(r, 2000));
        checkSignInRejected();

        if (page.url().includes('/challenge/')) {
          const twoStepVerificationHeading = page.locator('span', { hasText: '2-Step Verification' }).first();
          if (twoStepVerificationHeading) {
            try {
              clack.log.warning('2-Step Verification detected. Check your device now.');

              let checkDuration = 30000;
              let interval = 1000;
              let elapsed = 0;

              s.start('Waiting for 2FA verification (30s)...');
              while (elapsed < checkDuration) {
                checkSignInRejected();
                if (page.url().includes('search.google.com')) {
                  s.stop('2-Step Verification completed.');
                  break;
                }
                await new Promise((r) => setTimeout(r, interval));
                elapsed += interval;
                s.message(
                  `Waiting for 2FA verification (${Math.ceil((checkDuration - elapsed) / 1000)}s remaining)...`,
                );
              }

              if (elapsed >= checkDuration) {
                s.stop('2FA timeout.');
                clack.log.error('2-Step Verification timeout. Please retry with your verification device ready.');
                await context.close();
                process.exit();
              }
            } catch (e) {
              checkSignInRejected();
              clack.log.error(`There was an issue with 2-Step Verification: ${e.message}`);
              await context.close();
              process.exit();
            }
          }
        }
      } catch (error) {
        checkSignInRejected();
        clack.log.error('There was an issue submitting your password. Please check it and try again.');
        await context.close();
        process.exit();
      }
    }

    // Wait until GSC property is loaded
    checkSignInRejected();
    await page.getByText('Welcome to Google Search Console').waitFor({ state: 'visible' });
    clack.log.success('GSC access successful!');
    loggedIn = true;

    // Detect multi-account /u/N/ prefix from the current URL
    detectGscPrefix(page.url());
    if (gscPathPrefix) clack.log.info(`Multi-account prefix detected: ${gscPathPrefix}`);

    // Ask user for preferred date format
    const dateFormat = await clack.select({
      message: 'Select date format for exports:',
      options: [
        { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
        { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
        { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
      ],
    });
    if (clack.isCancel(dateFormat)) {
      clack.cancel('Cancelled.');
      await context.close();
      process.exit();
    }

    // Create Excel doc
    workbook = new Excel.Workbook();

    const createExcelTab = async (arr, wb, tabName) => {
      if (!arr || arr.length === 0) return;
      const headers = Object.keys(arr[0]).map((name) => ({ name, filterButton: true, width: 32 }));
      const sheet = wb.addWorksheet(tabName);
      sheet.addTable({
        name: tabName,
        ref: 'A1',
        headerRow: true,
        style: { showRowStripes: true },
        columns: headers,
        rows: arr.map((obj) => Object.values(obj)),
      });
    };

    // Proceed to the main logic if logged in
    if (loggedIn) {
      // Check if there is a site specified in credentials.js
      if (typeof site === 'string' && site.length > 0) sites.push(site);
      if (Array.isArray(site)) sites.push(...site);
      if (!site) {
        const s2 = clack.spinner();
        s2.start('Looking for GSC properties...');
        const gscProps = await page.evaluate(() => {
          var rawArray = Array.from(document.querySelectorAll('script[nonce]'), (el) => el.text);
          var sites = rawArray.filter((s) => s.includes('ds:1'))[1];
          var regex = new RegExp('((?:http|sc-domain)[^"]+)', 'g');
          var matches = [...sites.matchAll(regex)];
          var clean = matches.reduce((acc, cur) => {
            const site = cur[0];
            if (!site.includes('google.com')) acc.add(site);
            return acc;
          }, new Set());
          return Array.from(clean);
        });
        s2.stop(`Found ${gscProps.length} properties.`);

        // Select properties you want to extract data from (type to filter)
        const selectedProps = await clack.autocompleteMultiselect({
          message: 'Select properties (type to filter)',
          options: gscProps.map((p) => ({ value: p, label: p })),
          required: true,
        });
        if (clack.isCancel(selectedProps)) {
          clack.cancel('No properties were selected.');
          await context.close();
          process.exit();
        }
        sites.push(...selectedProps);
      }

      // Loop through site choices
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        clack.log.info(`${ansis.bold(`[${i + 1}/${sites.length}]`)} Extracting: ${ansis.cyan(site)}`);

        try {
          /* Data */
          const resource = encodeURIComponent(site);
          const { file, short } = friendlySiteName(site);
          const results = [];
          const summary = [];
          const sitemapRes = [];
          const summarySitemaps = [];

          // Create folder to store CSV output
          if (!existsSync(file)) await mkdir(file);

          // Access Index Coverage page from site
          const sp = clack.spinner();
          sp.start('Extracting report IDs...');
          await navigateAndCheck(page, buildGscUrl(resource, 'index'));

          // Extract available reports for property — scan ALL script blocks for report IDs
          const reportIDs = await page.evaluate(
            ([escapedProp]) => {
              var rawArray = Array.from(document.querySelectorAll('script[nonce]'), (el) => el.text);
              var regex = new RegExp(`"${escapedProp}",13,"([^"]+)"`, 'g');
              var ids = new Set();
              for (var script of rawArray) {
                for (var match of script.matchAll(regex)) ids.add(match[1]);
              }
              var reports = [{ category: 'Indexed', key: 'pages', param: 'ALL_URLS' }];
              ids.forEach((id) => reports.push({ category: 'Not indexed/Warning', key: 'item_key', param: id }));
              return reports;
            },
            [escapeRegex(site)],
          );
          sp.stop(`Found ${reportIDs.length} reports.`);

          // Loop through report categories
          for (let j = 0; j < reportIDs.length; j++) {
            const { category, key, param } = reportIDs[j];
            const report = buildGscUrl(resource, 'index/drilldown', { [key]: param });

            const rp = clack.spinner();
            const reportName = reportsNames[param] || param;
            rp.start(`[${j + 1}/${reportIDs.length}] Checking ${reportName}...`);
            await navigateAndCheck(page, report);

            const reportUrls = await page.evaluate(
              ([sel, cat]) => {
                const updated = document.querySelector('.zTJZxd.zOPr2c')?.innerText ?? 'No date';
                const arr = Array.from(document.querySelectorAll(sel)).map((url) => ({
                  status: cat,
                  'report name': document.querySelector('.Iq9klb')?.innerText ?? 'No name',
                  url: url.innerText.replace(/[\uE14D\uE89E\uE8B6]/g, ''),
                  updated: updated.replace(/[^\d|\/]+/g, ''),
                }));
                return Promise.resolve(arr);
              },
              [reportSelector, category],
            );

            results.push(...reportUrls);
            rp.stop(`[${j + 1}/${reportIDs.length}] ${reportName} — ${reportUrls.length} URLs`);

            if (reportUrls.length !== 0) {
              const total = await page.evaluate(() => {
                const el = Array.from(document.querySelectorAll('.CO3mte')).pop();
                if (!el) return 0;
                const title = el.getAttribute('title') || (el.closest('.CO3mte[title]') || {getAttribute:()=>null}).getAttribute('title');
                if (title) { const n = parseInt(title.replace(/,/g, '')); if (!isNaN(n)) return n; }
                const text = (el.innerText || '').trim();
                const m = text.match(/^([\d,.]+)\s*([KMBkmb])?$/);
                if (m) { const n = parseFloat(m[1].replace(/,/g, '')); const s = (m[2]||'').toUpperCase(); if (s==='K') return Math.round(n*1000); if (s==='M') return Math.round(n*1000000); if (s==='B') return Math.round(n*1000000000); return Math.round(n); }
                return parseInt(text.replace(/[,.\s]/g, '')) || 0;
              });

              summary.push({
                status: category,
                'report name': reportUrls[0]['report name'],
                '# URLs extracted': reportUrls.length,
                'total reported': total,
                'extraction ratio': reportUrls.length / total,
              });

              if (param === 'ALL_URLS' && sites.length > 1) {
                indexedSum.push({
                  'GSC Property': site,
                  status: category,
                  'report name': reportUrls[0]['report name'],
                  '# URLs extracted': reportUrls.length,
                  'total reported': total,
                  'extraction ratio': reportUrls.length / total,
                });
              }
            }
          }

          // Reformat dates using auto-detection + user-chosen output format
          const finalResults = results.map(({ updated, ...rest }) => {
            const parsed = parseGscDateStr(updated);
            const formatted = parsed ? formatDate(parsed, dateFormat) : updated;
            return { ...rest, 'last updated': formatted };
          });

          // Write CSV files
          if (finalResults.length) {
            await writeFile(`./${file}/coverage_${file}_${currentDate()}.csv`, jsonToCsv(finalResults));
            await writeFile(`./${file}/summary_${file}_${currentDate()}.csv`, jsonToCsv(summary));
            clack.log.success(`Coverage CSV files created for ${ansis.cyan(site)}`);
          }
          totalUrls += finalResults.length;

          // Add data to Excel doc as tabs
          createExcelTab(summary, workbook, `${short}_SUM`);
          createExcelTab(finalResults, workbook, `${short}_COV`);

          if (sitemapExtract) {
            const ssp = clack.spinner();
            ssp.start('Extracting sitemap coverage...');
            await navigateAndCheck(page, buildGscUrl(resource, 'sitemaps'));

            const sitemaps = await page.evaluate(() => {
              const list = Array.from(document.querySelectorAll('.nJ0sOc.Ev7kWb.ptEsvc.s4dpBd'));
              return Promise.resolve(list.map((row) => row.dataset.rowid));
            });
            ssp.stop(`Found ${sitemaps.length} sitemaps.`);

            let consecutiveEmpty = 0;
            for (let k = 0; k < sitemaps.length; k++) {
              if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
                const remaining = sitemaps.length - k;
                clack.log.warning(`Skipping ${remaining} remaining sitemaps (${MAX_CONSECUTIVE_EMPTY} consecutive had no data)`);
                break;
              }

              const sitemap = sitemaps[k];
              const smp = clack.spinner();
              smp.start(`[${k + 1}/${sitemaps.length}] Sitemap: ${sitemap}`);

              try {
                const sitemapReport = buildGscUrl(resource, 'index', { pages: 'SITEMAP', sitemap });
                const reportPage = await page.goto(sitemapReport);
                await checkForGoogleError(page);
                if (!reportPage) throw new Error(`Navigation returned null for sitemap ${sitemap}`);
                const source = await reportPage.text();
                const reportKeys = [...source.matchAll(/CAES\w+/g)];
                const sitemapCoverageReports = new Set();
                for (const val of reportKeys) sitemapCoverageReports.add(val[0]);

                const sitemapNums = await page.evaluate(
                  (origin) => {
                    const topNums = Array.from(document.querySelectorAll('.nnLLaf'));
                    if (topNums.length > 0) {
                      const extractNums = topNums.map((el) => {
                        const title = el.getAttribute('title');
                        if (title) { const n = parseInt(title.replace(/,/g, '')); if (!isNaN(n)) return n; }
                        const text = (el.innerText || '').trim();
                        const m = text.match(/^([\d,.]+)\s*([KMBkmb])?$/);
                        if (m) { const n = parseFloat(m[1].replace(/,/g, '')); const s = (m[2]||'').toUpperCase(); if (s==='K') return Math.round(n*1000); if (s==='M') return Math.round(n*1000000); if (s==='B') return Math.round(n*1000000000); return Math.round(n); }
                        return parseInt(text.replace(/[,.\s]/g, '')) || 0;
                      });
                      return Promise.resolve({
                        sitemap: origin[0],
                        'Not indexed': extractNums[0],
                        indexed: extractNums[1],
                      });
                    } else {
                      return Promise.resolve({
                        sitemap: origin[0],
                        'Not indexed': 'Sitemap fetching error',
                        indexed: 'Sitemap fetching error',
                      });
                    }
                  },
                  [sitemap],
                );
                summarySitemaps.push(sitemapNums);

                const indexedReport = buildGscUrl(resource, 'index/drilldown', { pages: 'SITEMAP', sitemap });
                await navigateAndCheck(page, indexedReport);

                const validURLs = await page.evaluate(
                  ([sel, cat, title, origin]) => {
                    const reportName = document.querySelector(title)?.innerText ?? 'No title';
                    const date = document.querySelector('.J54Vt')?.nextSibling?.textContent ?? 'No date';
                    const urls = Array.from(document.querySelectorAll(sel)).map((row) => ({
                      sitemap: origin,
                      'report name': reportName,
                      url: row.innerText.replace(/[\uE14D\uE89E\uE8B6]/g, ''),
                      date,
                    }));
                    return Promise.resolve(urls);
                  },
                  [reportSelector, reportStatus, reportTitle, sitemap],
                );
                sitemapRes.push(...validURLs);

                for (const key of sitemapCoverageReports) {
                  const indReport = buildGscUrl(resource, 'index/drilldown', { item_key: key });
                  await navigateAndCheck(page, indReport);
                  const indReportUrls = await page.evaluate(
                    ([sel, title, origin]) => {
                      const reportName = document.querySelector(title)?.innerText ?? 'No title';
                      const date = document.querySelector('.J54Vt')?.nextSibling?.textContent ?? 'No date';
                      const urls = Array.from(document.querySelectorAll(sel)).map((row) => ({
                        sitemap: origin,
                        'report name': reportName,
                        url: row.innerText.replace(/[\uE14D\uE89E\uE8B6]/g, ''),
                        date,
                      }));
                      return Promise.resolve(urls);
                    },
                    [reportSelector, reportTitle, sitemap],
                  );
                  sitemapRes.push(...indReportUrls);
                }

                if (validURLs.length > 0) {
                  consecutiveEmpty = 0;
                } else {
                  consecutiveEmpty++;
                }
                smp.stop(`[${k + 1}/${sitemaps.length}] Sitemap: ${sitemap} — ${validURLs.length} URLs`);
              } catch (e) {
                smp.stop(`[${k + 1}/${sitemaps.length}] Sitemap: ${sitemap} — Error: ${e.message}`);
                clack.log.warning(`Skipped sitemap ${sitemap}: ${e.message}`);
              }
              await new Promise((r) => setTimeout(r, 4000));
            }

            // Reformat sitemap dates
            const finalSitemapRes = sitemapRes.map(({ date, ...rest }) => {
              const parsed = parseGscDateStr(date);
              const formatted = parsed ? formatDate(parsed, dateFormat) : date;
              return { ...rest, 'last updated': formatted };
            });

            if (finalSitemapRes.length) {
              await writeFile(`./${file}/sitemaps-${file}_${currentDate()}.csv`, jsonToCsv(finalSitemapRes));
              await writeFile(`./${file}/sum-sitemaps-${file}_${currentDate()}.csv`, jsonToCsv(summarySitemaps));
              clack.log.success(`Sitemap CSV files created for ${ansis.cyan(site)}`);
              createExcelTab(summarySitemaps, workbook, `${short}_SUM_MAPS`);
              createExcelTab(finalSitemapRes, workbook, `${short}_MAPS`);
              totalUrls += finalSitemapRes.length;
            }
          }
        } catch (propError) {
          clack.log.error(`Error extracting ${site}: ${propError.message}`);
          clack.log.warning('Continuing with next property...');
        }
      }

      // Add indexed summary tab if there was data for more than 1 property
      if (indexedSum.length) {
        createExcelTab(indexedSum, workbook, `Indexed_summary_ALL`);
        let tabs = workbook.worksheets;
        let last = tabs.length - 1;
        tabs[last].orderNo = 0;
      }

      // Close Browser
      await context.close();
      context = null;

      // Export Excel File
      const outputFile = `index-results_${currentDate()}.xlsx`;
      await workbook.xlsx.writeFile(outputFile);

      // Final summary
      clack.log.success(`${ansis.bold(sites.length)} properties processed`);
      clack.log.success(`${ansis.bold(totalUrls)} total URLs extracted`);
      clack.log.success(`Output: ${ansis.cyan(outputFile)}`);
      clack.outro('All done!');
    } else {
      clack.cancel('No properties were selected.');
      await context.close();
      process.exit();
    }
  } catch (error) {
    clack.log.error(`Unexpected error: ${error.message}`);

    // Save partial results if workbook has data
    if (workbook && workbook.worksheets.length > 0) {
      try {
        const partialFile = `index-results_PARTIAL_${currentDate()}.xlsx`;
        await workbook.xlsx.writeFile(partialFile);
        clack.log.warning(`Partial results saved: ${partialFile}`);
      } catch (_) {}
    }

    if (context) {
      try {
        await context.close();
      } catch (_) {}
    }
    process.exit(1);
  }
})();
