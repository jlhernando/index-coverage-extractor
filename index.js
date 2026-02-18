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
const headless = true; // Whether you want to see the browser automation (false) or run hidden (true) - Default true
const sitemapExtract = true; // Whether you want to extract data from sitemaps or not - Default true
const sites = []; // Holding array for GSC properties
const indexedSum = []; // Holding array for summary of indexed URLs from all GSC properties
const americanDate = false; // Variable to identify that the GSC property has American Date (mm/dd/yy). If your GSC property does not have American Date this variable should be set as false
const americanDateChange = false; // Converts American Date (mm/dd/yy) in GSC to European Date (dd/mm/yy)
const reportSelector = '.OOHai'; // CSS Selector from report Urls
const reportTitle = '.Iq9klb'; // CSS Selector to extract report name from sitemap coverage reports
const reportStatus = '.DDFhO'; // CSS Selector to extract report status from sitemap coverage reports
const profilePath = './chrome-profile'; // Persistent Chrome profile directory — stores cookies, sessions, etc.
const gscHomepage = 'https://search.google.com/search-console/welcome?hl=en'; // GSC Homepage URL

// Asynchronous IIFE
(async () => {
  clack.intro(ansis.bgCyanBright(' GSC Index Coverage Extractor v3.0.0 '));

  let context;
  let totalUrls = 0;

  try {
    // Setup browser with persistent profile (avoids Google detecting automation)
    const s = clack.spinner();
    s.start('Launching browser...');

    context = await chromium.launchPersistentContext(profilePath, {
      headless: headless,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
    });

    let page = context.pages()[0] || await context.newPage();
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
          gmail = await clack.text({ message: 'Input your Google Account email:', validate: (v) => v.length === 0 ? 'Email is required' : undefined });
          if (clack.isCancel(gmail)) { clack.cancel('Cancelled.'); await context.close(); process.exit(); }
        } else gmail = email;

        s.start('Submitting email...');
        await page.getByRole('textbox', { name: 'Email or phone' }).pressSequentially(gmail, { delay: 50 });
        await page.keyboard.press('Enter');

        await page.waitForResponse((resp) =>
          resp.url().includes('https://accounts.google.com/v3/signin/_/AccountsSignInUi/'),
        );
        checkSignInRejected();
        if (await page.getByText("Couldn\u2019t find your Google Account").isVisible()) {
          s.stop('Email rejected.');
          clack.log.error("Google couldn\u2019t find your Google Account. Check the email and try again.");
          await context.close();
          process.exit();
        }
        s.stop('Email accepted.');
      } catch (error) {
        checkSignInRejected();
        clack.log.error(`There was an issue with your email address: ${error.message}`);
        await context.close();
        process.exit();
      }

      // Find and submit Password input
      let password = '';

      try {
        if (!pass) {
          password = await clack.password({ message: 'Input your Google Account password:', validate: (v) => v.length === 0 ? 'Password is required' : undefined });
          if (clack.isCancel(password)) { clack.cancel('Cancelled.'); await context.close(); process.exit(); }
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
                s.message(`Waiting for 2FA verification (${Math.ceil((checkDuration - elapsed) / 1000)}s remaining)...`);
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
        clack.log.error(`There was an issue with your password: ${error.message}`);
        await context.close();
        process.exit();
      }
    }

    // Wait until GSC property is loaded
    checkSignInRejected();
    await page.getByText('Welcome to Google Search Console').waitFor({ state: 'visible' });
    clack.log.success('GSC access successful!');
    loggedIn = true;

    // Create Excel doc
    const workbook = new Excel.Workbook();

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
        await page.goto(`https://search.google.com/search-console/index?resource_id=${resource}`);

        // Extract available reports for property — scan ALL script blocks for report IDs
        const reportIDs = await page.evaluate(
          ([prop]) => {
            var rawArray = Array.from(document.querySelectorAll('script[nonce]'), (el) => el.text);
            var regex = new RegExp(`"${prop}",13,"([^"]+)"`, 'g');
            var ids = new Set();
            for (var script of rawArray) {
              for (var match of script.matchAll(regex)) ids.add(match[1]);
            }
            var reports = [{ category: 'Indexed', key: 'pages', param: 'ALL_URLS' }];
            ids.forEach((id) => reports.push({ category: 'Not indexed/Warning', key: 'item_key', param: id }));
            return reports;
          },
          [site],
        );
        sp.stop(`Found ${reportIDs.length} reports.`);

        // Loop through report categories
        for (let j = 0; j < reportIDs.length; j++) {
          const { category, key, param } = reportIDs[j];
          const report = `https://search.google.com/search-console/index/drilldown?resource_id=${resource}&${key}=${param}`;

          const rp = clack.spinner();
          const reportName = reportsNames[param] || param;
          rp.start(`[${j + 1}/${reportIDs.length}] Checking ${reportName}...`);
          await page.goto(report);

          const reportUrls = await page.evaluate(
            ([sel, cat]) => {
              const updated = document.querySelector('.zTJZxd.zOPr2c')?.innerText ?? 'No date';
              const arr = Array.from(document.querySelectorAll(sel)).map((url) => ({
                status: cat,
                'report name': document.querySelector('.Iq9klb')?.innerText ?? 'No name',
                url: url.innerText.replace(//g, ''),
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
              const num = Array.from(document.querySelectorAll('.CO3mte'));
              return Promise.resolve(parseInt(num[num.length - 1].attributes.title.textContent.replace(',', '')));
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

        // Change date format
        const finalResults = results.map(({ updated, ...rest }) => {
          if (americanDate) {
            return { ...rest, 'last updated': formatDate(updated, 'MM-DD-YYYY', americanDateChange ? 'DD-MM-YYYY' : 'MM-DD-YYYY') };
          } else {
            return { ...rest, 'last updated': formatDate(updated, 'DD-MM-YYYY', 'DD-MM-YYYY') };
          }
        });

        // Write CSV files
        if (finalResults.length) {
          writeFile(`./${file}/coverage_${file}_${currentDate()}.csv`, jsonToCsv(finalResults));
          writeFile(`./${file}/summary_${file}_${currentDate()}.csv`, jsonToCsv(summary));
          clack.log.success(`Coverage CSV files created for ${ansis.cyan(site)}`);
        }
        totalUrls += finalResults.length;

        // Add data to Excel doc as tabs
        createExcelTab(summary, workbook, `${short}_SUM`);
        createExcelTab(finalResults, workbook, `${short}_COV`);

        if (sitemapExtract) {
          const ssp = clack.spinner();
          ssp.start('Extracting sitemap coverage...');
          const sitemapEndPoint = `https://search.google.com/search-console/sitemaps?resource_id=${resource}`;
          await page.goto(sitemapEndPoint);

          const sitemaps = await page.evaluate(() => {
            const list = Array.from(document.querySelectorAll('.nJ0sOc.Ev7kWb.ptEsvc.s4dpBd'));
            return Promise.resolve(list.map((row) => row.dataset.rowid));
          });
          ssp.stop(`Found ${sitemaps.length} sitemaps.`);

          for (let k = 0; k < sitemaps.length; k++) {
            const sitemap = sitemaps[k];
            const smp = clack.spinner();
            smp.start(`[${k + 1}/${sitemaps.length}] Sitemap: ${sitemap}`);

            const sitemapReport = `https://search.google.com/search-console/index?resource_id=${resource}&pages=SITEMAP&sitemap=${encodeURIComponent(sitemap)}`;
            const reportPage = await page.goto(sitemapReport);
            if (!reportPage) throw new Error(`Navigation returned null for ${sitemapReport}`);
            const source = await reportPage.text();
            const reportKeys = [...source.matchAll(/CAES\w+/g)];
            const sitemapCoverageReports = new Set();
            for (const val of reportKeys) sitemapCoverageReports.add(val[0]);

            const sitemapNums = await page.evaluate(
              (origin) => {
                const topNums = Array.from(document.querySelectorAll('.nnLLaf'));
                if (topNums.length > 0) {
                  const extractNums = topNums.map((num) => num.attributes.title.textContent);
                  return Promise.resolve({
                    sitemap: origin[0],
                    'Not indexed': parseInt(extractNums[0].replace(',', '')),
                    indexed: parseInt(extractNums[1].replace(',', '')),
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

            const indexedReport = `https://search.google.com/search-console/index/drilldown?resource_id=${resource}&pages=SITEMAP&sitemap=${encodeURIComponent(sitemap)}`;
            await page.goto(indexedReport);

            const validURLs = await page.evaluate(
              ([sel, cat, title, origin]) => {
                const reportName = document.querySelector(title).innerText ?? 'No title';
                const date = document.querySelector('.J54Vt').nextSibling ?? 'No date';
                const urls = Array.from(document.querySelectorAll(sel)).map((row) => ({
                  sitemap: origin,
                  'report name': reportName,
                  url: row.innerText.replace(//g, ''),
                  date: date.textContent,
                }));
                return Promise.resolve(urls);
              },
              [reportSelector, reportStatus, reportTitle, sitemap],
            );
            sitemapRes.push(...validURLs);

            for (const key of sitemapCoverageReports) {
              const indReport = `https://search.google.com/search-console/index/drilldown?resource_id=${site}&item_key=${key}`;
              await page.goto(indReport);
              const indReportUrls = await page.evaluate(
                ([sel, title, origin]) => {
                  const reportName = document.querySelector(title).innerText ?? 'No title';
                  const date = document.querySelector('.J54Vt').nextSibling ?? 'No date';
                  const urls = Array.from(document.querySelectorAll(sel)).map((row) => ({
                    sitemap: origin,
                    'report name': reportName,
                    url: row.innerText.replace(//g, ''),
                    date: date.textContent,
                  }));
                  return Promise.resolve(urls);
                },
                [reportSelector, reportTitle, sitemap],
              );
              sitemapRes.push(...indReportUrls);
            }
            smp.stop(`[${k + 1}/${sitemaps.length}] Sitemap: ${sitemap} — ${validURLs.length} URLs`);
            await new Promise((r) => setTimeout(r, 4000));
          }

          const finalSitemapRes = sitemapRes.map(({ date, ...rest }) => {
            if (americanDate) {
              return { ...rest, 'last updated': formatDate(date, 'MM-DD-YYYY', americanDateChange ? 'DD-MM-YYYY' : 'MM-DD-YYYY') };
            } else {
              return { ...rest, 'last updated': formatDate(date, 'DD-MM-YYYY', 'DD-MM-YYYY') };
            }
          });

          if (finalSitemapRes.length) {
            writeFile(`./${file}/sitemaps-${file}_${currentDate()}.csv`, jsonToCsv(finalSitemapRes));
            writeFile(`./${file}/sum-sitemaps-${file}_${currentDate()}.csv`, jsonToCsv(summarySitemaps));
            clack.log.success(`Sitemap CSV files created for ${ansis.cyan(site)}`);
            createExcelTab(summarySitemaps, workbook, `${short}_SUM_MAPS`);
            createExcelTab(finalSitemapRes, workbook, `${short}_MAPS`);
            totalUrls += finalSitemapRes.length;
          }
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
    if (context) {
      try { await context.close(); } catch (_) {}
    }
    process.exit(1);
  }
})();
