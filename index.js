/* Modules */
import { email, pass, site } from './credentials.js'; // Import Google Search Credentials - EDIT CREDENTIALS.JS
import { writeFile, mkdir } from 'fs/promises'; // Module to access the File System - Extract only ones needed
import { existsSync } from 'fs'; // File System sync
import { chromium } from 'playwright'; // Uses system Chrome for best Google login compatibility
import { reportsNames } from './report-names.js'; // Custom array of objects with specific params to access GSC reports
import { friendlySiteName, formatDate, currentDate, jsonToCsv } from './utils.js'; // Utility functions
import Excel from 'exceljs'; // Create Excel docs in JS
import * as clack from '@clack/prompts'; // Modern terminal prompts (text, password, multiselect)
import ansis from 'ansis'; // Terminal colors (lightweight chalk replacement)

/* Settings */
const headless = false; // Wether if you want to see the browser automation (false) or not (true) - Default true
const sitemapExtract = true; // Wether you want to extract data from sitemaps or not - Default true
const sites = []; // Holding array for GSC properties
const indexedSum = []; // Holding array for summary of indexed URLs from all GSC properties
const americanDate = false; // Variable to identify that the GSC property has American Date (mm/dd/yy). If your GSC property does not have American Date this variable should be set as false
const americanDateChange = false; // Converts American Date (mm/dd/yy) in GSC to European Date (dd/mm/yy)
const reportSelector = '.OOHai'; // CSS Selector from report Urls
const reportTitle = '.Iq9klb'; // CSS Selector to extract report name from sitemap coverage reports
const reportStatus = '.DDFhO'; // CSS Selector to extract report status from sitemap coverage reports
const warning = ansis.hex('#FFA500'); // Warning color
const profilePath = './chrome-profile'; // Persistent Chrome profile directory — stores cookies, sessions, etc.
const gscHomepage = 'https://search.google.com/search-console/welcome?hl=en'; // GSC Homepage URL

// Asynchronous IIFE - Immeditaly invoked function expression
(async () => {
  console.log('Launching browser...'); // Initial log to let the user know the script is running

  // Setup browser with persistent profile (avoids Google detecting automation)
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: headless,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  // Setup New Page
  let page = context.pages()[0] || await context.newPage();

  // Helper: check if Google blocked the sign-in as "unsafe browser"
  const checkSignInRejected = () => {
    if (page.url().includes('/signin/rejected')) {
      console.log(ansis.red('\nGoogle blocked the sign-in: "This browser or app may not be secure."'));
      console.log(warning('Try the following:'));
      console.log(warning('  1. Delete the chrome-profile/ folder and run the script again'));
      console.log(warning('  2. Set headless = false in index.js to manually complete the login'));
      console.log(warning('  3. If using 2FA, try generating an app-specific password'));
      process.exit(1);
    }
  };

  // Check if already logged in by visiting a page that requires authentication
  await page.goto(gscHomepage);
  await new Promise((r) => setTimeout(r, 2000)); // Wait for redirects to settle
  checkSignInRejected();
  let loggedIn = false;

  try {
    await page.getByText('Welcome to Google Search Console').waitFor({ state: 'visible', timeout: 3000 });
    console.log('Already logged in.');
    loggedIn = true;
  } catch (error) {
    console.log('Not logged in, proceeding with login...');

    // Find and submit Email input
    let gmail = '';

    try {
      // Check if there is an email in credentials file or let user add email in prompt
      if (!email) {
        gmail = await clack.text({ message: 'Input your Google Account email:', validate: (v) => v.length === 0 ? 'Email is required' : undefined });
        if (clack.isCancel(gmail)) { console.log('Cancelled.'); process.exit(); }
      } else gmail = email;

      // Input email
      await page.getByRole('textbox', { name: 'Email or phone' }).pressSequentially(gmail, { delay: 50 });
      await page.keyboard.press('Enter');
      console.log('Inputing email...');

      // Check if there was an error message / issue
      await page.waitForResponse((resp) =>
        resp.url().includes('https://accounts.google.com/v3/signin/_/AccountsSignInUi/'),
      );
      checkSignInRejected();
      if (await page.getByText("Couldn\u2019t find your Google Account").isVisible()) {
        console.log(
          ansis.red(
            "Google couldn\u2019t find your Google Account. Check the email you have added and run the script again.",
          ),
        );
        process.exit();
      }
    } catch (error) {
      checkSignInRejected();
      console.log(ansis.red('There was an issue with your email address.', error));
      process.exit();
    }
    // Find and submit Password input
    let password = '';

    try {
      if (!pass) {
        password = await clack.password({ message: 'Input your Google Account password:', validate: (v) => v.length === 0 ? 'Password is required' : undefined });
        if (clack.isCancel(password)) { console.log('Cancelled.'); process.exit(); }
      } else password = pass;

      await page.getByRole('textbox', { name: 'Enter your password' }).pressSequentially(password, { delay: 50 });
      await page.keyboard.press('Enter');
      console.log('Inputing password...');

      // Check if there was an error message / issue
      await page.waitForResponse((resp) =>
        resp.url().includes('https://accounts.google.com/v3/signin/_/AccountsSignInUi/'),
      );
      checkSignInRejected();
      if (await page.getByText('Wrong password').isVisible()) {
        console.log(ansis.red('Wrong Password. Run the script and try again.'));
        process.exit();
      }

      await new Promise((r) => setTimeout(r, 2000)); // Wait a bit for text to load
      checkSignInRejected();

      if (page.url().includes('/challenge/')) {
        const twoStepVerificationHeading = page.locator('span', { hasText: '2-Step Verification' }).first();
        if (twoStepVerificationHeading) {
          try {
            console.log(
              warning(
                'You have 2-step Verification enabled. Check your device to pass to the next step. The script will only wait for 30 seconds',
              ),
            );
            console.log('Waiting 30 seconds...');

            // Check if the URL is GSC's Homepage every second for up to 30 seconds
            let checkDuration = 30000; // 30 seconds
            let interval = 1000; // 1 second
            let elapsed = 0;

            while (elapsed < checkDuration) {
              checkSignInRejected();
              if (page.url().includes('search.google.com')) {
                console.log(ansis.green('2-step verification completed.'));
                break;
              }
              await new Promise((r) => setTimeout(r, interval));
              elapsed += interval;
            }

            if (elapsed >= checkDuration) {
              console.log(ansis.red('2-step Verification timeout. Please retry with your verification device ready.'));
              process.exit();
            }
          } catch (e) {
            checkSignInRejected();
            console.log(ansis.red('There was an issue with 2-step Verification: ', e));
            process.exit();
          }
        }
      }
    } catch (error) {
      checkSignInRejected();
      console.error(ansis.red('There was an issue with your password: ', error));
      process.exit();
    }
  }
  // Wait until GSC property is loaded
  checkSignInRejected();
  await page.getByText('Welcome to Google Search Console').waitFor({ state: 'visible' });
  console.log(ansis.bgGreen('GSC access sucessful!'));
  loggedIn = true;

  // Create Excel doc
  const workbook = new Excel.Workbook();

  const createExcelTab = async (arr, wb, tabName) => {
    if (!arr || arr.length === 0) {
      console.log(ansis.red(`No data available to create Excel tab: ${tabName}`));
      return;
    }
    const headers = Object.keys(arr[0]).map((name) => ({ name, filterButton: true, width: 32 }));

    const sheet = wb.addWorksheet(tabName);

    sheet.addTable({
      name: tabName,
      ref: 'A1',
      headerRow: true,
      style: {
        showRowStripes: true,
      },
      columns: headers,
      rows: arr.map((obj) => Object.values(obj)),
    });
  };

  // Proceed to the main logic if logged in
  if (loggedIn) {
    console.log('Logged in, proceeding with extraction...');
    // Check if there is a site specified in credentials.js
    if (typeof site === 'string' && site.length > 0) sites.push(site);
    if (Array.isArray(site)) sites.push(...site);
    if (!site) {
      console.log('Looking for GSC properties...');
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

      // Select properties you want to extract data from
      const selectedProps = await clack.multiselect({
        message: 'Select properties (min. 1)',
        options: gscProps.map((p) => ({ value: p, label: p })),
        required: true,
      });
      if (clack.isCancel(selectedProps)) {
        console.log(ansis.red('No properties were selected.'));
        process.exit();
      }
      sites.push(...selectedProps);
    }
    // Loop through site choices
    for (let site of sites) {
      console.log(ansis.bgCyanBright('Extracting data from: ', site));

      /* Data */
      const resource = encodeURIComponent(site); // Encode it to create the correct URL
      const { file, short } = friendlySiteName(site);
      const results = []; // Empty holding array to push report results
      const summary = []; // Empty holding array to push summary results per report
      const sitemapRes = []; // Empty holding array to push coverage results per sitemap
      const summarySitemaps = []; // Empty holding array to push coverage summary results per sitemap

      // Create folder to store CSV output
      !existsSync(file) ? mkdir(file) : console.log(`${file} folder already exists`);

      // Access Index Coverage page from site
      await page.goto(`https://search.google.com/search-console/index?resource_id=${resource}`);

      // Extract available reports for property
      const reportIDs = await page.evaluate(
        ([prop]) => {
          // Extract text content from desired script tags
          var rawArray = Array.from(document.querySelectorAll('script[nonce]'), (el) => el.text);
          var ruleNotIndexed = 'ds:11';
          var ruleWarning = 'ds:13';

          // Isolate the right script that match rules
          var notIndexed = rawArray.filter((s) => s.includes(ruleNotIndexed))[1];
          var warning = rawArray.filter((s) => s.includes(ruleWarning))[1];
          var script = notIndexed.concat(warning);
          console.log(script);

          // Match Report IDs
          var regex = new RegExp(`"${prop}",13,"([^"]+)"`, 'g');
          var matches = [...script.matchAll(regex)];

          // Capture unique IDs
          var ids = new Set();

          for (const match of matches) {
            ids.add(match[1]);
          }

          // Create output with Indexed report already in
          const reports = [{ category: 'Indexed', key: 'pages', param: 'ALL_URLS' }];
          ids.forEach((id) => reports.push({ category: 'Not indexed/Warning', key: 'item_key', param: id }));

          return reports;
        },
        [site],
      );

      console.log(`Found ${reportIDs.length} reports`);

      // Loop through report categories
      for (const { category, key, param } of reportIDs) {
        /* Individual site settings */
        const report = `https://search.google.com/search-console/index/drilldown?resource_id=${resource}&${key}=${param}`; // URL to report each report

        // Individual report
        await page.goto(report);

        // Extract URLs from each report
        const reportUrls = await page.evaluate(
          ([sel, cat, rep]) => {
            // Extract Last Updated date
            const updated = document.querySelector('.zTJZxd.zOPr2c')?.innerText ?? 'No date';

            // Extract URls and build result object
            const arr = Array.from(document.querySelectorAll(sel)).map((url) => ({
              status: cat,
              'report name': document.querySelector('.Iq9klb')?.innerText ?? 'No name',
              url: url.innerText.replace(//g, ''),
              updated: updated.replace(/[^\d|\/]+/g, ''),
            }));
            return Promise.resolve(arr);
          },
          [reportSelector, category, param],
        );

        // Push urls from each report into results array for future CSV rows
        results.push(...reportUrls);

        // Log extraction result
        console.log(`Checking ${reportsNames[param]} report - ${reportUrls.length} URLs found`);

        // If there is data in the report create unique objects (future CSV rows) per URL
        if (reportUrls.length !== 0) {
          // Extract total number of URLs reported by GSC
          const total = await page.evaluate(() => {
            const num = Array.from(document.querySelectorAll('.CO3mte'));
            return Promise.resolve(parseInt(num[num.length - 1].attributes.title.textContent.replace(',', '')));
          });

          // Create summary object per report type (for future CSV rows)
          summary.push({
            status: category,
            'report name': reportUrls[0]['report name'],
            '# URLs extracted': reportUrls.length,
            'total reported': total,
            'extraction ratio': reportUrls.length / total,
          });

          if (param === 'ALL_URLS' && sites.length > 1) {
            console.log('Adding indexed summary of', sites.length, ' sites');
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
      // Change date format from reportUrls objects
      const finalResults = results.map(({ updated, ...rest }) => {
        if (americanDate) {
          const lastUpdated = formatDate(updated, 'MM-DD-YYYY', americanDateChange ? 'DD-MM-YYYY' : 'MM-DD-YYYY');
          return { ...rest, 'last updated': lastUpdated };
        } else {
          const lastUpdated = formatDate(updated, 'DD-MM-YYYY', 'DD-MM-YYYY');
          return { ...rest, 'last updated': lastUpdated };
        }
      });

      // Parse JSON to CSV if there is data to parse
      if (finalResults.length) {
        writeFile(`./${file}/coverage_${file}_${currentDate()}.csv`, jsonToCsv(finalResults));
        writeFile(`./${file}/summary_${file}_${currentDate()}.csv`, jsonToCsv(summary));
        console.log(ansis.green('URL Coverage CSV outputs created!'));
      }

      // Add data to Excel doc as tabs
      createExcelTab(summary, workbook, `${short}_SUM`);
      createExcelTab(finalResults, workbook, `${short}_COV`);

      if (sitemapExtract) {
        // Extract sitemap index coverage
        const sitemapEndPoint = `https://search.google.com/search-console/sitemaps?resource_id=${resource}`;
        await page.goto(sitemapEndPoint);

        // Extract list of sitemaps into array
        const sitemaps = await page.evaluate(() => {
          const list = Array.from(document.querySelectorAll('.nJ0sOc.Ev7kWb.ptEsvc.s4dpBd'));
          return Promise.resolve(list.map((row) => row.dataset.rowid));
        });

        // Loop through each sitemap report
        for (const sitemap of sitemaps) {
          // Individual sitemap report
          const sitemapReport = `https://search.google.com/search-console/index?resource_id=${resource}&pages=SITEMAP&sitemap=${encodeURIComponent(
            sitemap,
          )}`;
          // Go to Sitemap report and log URL
          const reportPage = await page.goto(sitemapReport);
          console.log(ansis.bgBlue(`Extracting coverage data from sitemap: ${sitemap}`));
          // Intercept Doc Network request (raw HTML)
          if (!reportPage) throw new Error(`Navigation returned null for ${sitemapReport}`);
          const source = await reportPage.text();
          // Find individual sitemap report keys (IDs) through pattern
          const reportKeys = [...source.matchAll(/CAES\w+/g)];
          // Store individual sitemap report keys without duplicates
          const sitemapCoverageReports = new Set();
          // Loop through matchAll values to extract individual sitemap report keys
          for (const val of reportKeys) {
            sitemapCoverageReports.add(val[0]);
          }

          // Get coverage summary of sitemap
          const sitemapNums = await page.evaluate(
            (origin) => {
              const topNums = Array.from(document.querySelectorAll('.nnLLaf'));
              if (topNums.length > 0) {
                const extractNums = topNums.map((num) => num.attributes.title.textContent);
                const summarySitemapCoverage = {
                  sitemap: origin[0],
                  'Not indexed': parseInt(extractNums[0].replace(',', '')),
                  indexed: parseInt(extractNums[1].replace(',', '')),
                };
                return Promise.resolve(summarySitemapCoverage);
              } else
                return Promise.resolve({
                  sitemap: origin[0],
                  'Not indexed': 'Sitemap fetching error',
                  indexed: 'Sitemap fetching error',
                });
            },
            [sitemap],
          );

          // Add individual sitemap summary numbers to summarySitemaps array
          summarySitemaps.push(sitemapNums);

          // Access & Extract Indexed URLs from sitemap
          const indexedReport = `https://search.google.com/search-console/index/drilldown?resource_id=${resource}&pages=SITEMAP&sitemap=${encodeURIComponent(
            sitemap,
          )}`;
          await page.goto(indexedReport);

          // Extract report title and URLs from each report
          const validURLs = await page.evaluate(
            ([sel, cat, title, origin]) => {
              const reportName = document.querySelector(title).innerText ?? 'No title';
              const date = document.querySelector('.J54Vt').nextSibling ?? 'No date';
              const urls = Array.from(document.querySelectorAll(sel)).map((row) => {
                return {
                  sitemap: origin,
                  'report name': reportName,
                  url: row.innerText.replace(//g, ''),
                  date: date.textContent,
                };
              });
              return Promise.resolve(urls);
            },
            [reportSelector, reportStatus, reportTitle, sitemap],
          );

          // Push sitemap coverage results to holding array
          sitemapRes.push(...validURLs);

          // Access each individual coverage reports from each sitemap
          for (const key of sitemapCoverageReports) {
            const indReport = `https://search.google.com/search-console/index/drilldown?resource_id=${site}&item_key=${key}`;
            await page.goto(indReport);

            // Extract report title and URLs from each report
            const indReportUrls = await page.evaluate(
              ([sel, title, origin]) => {
                const reportName = document.querySelector(title).innerText ?? 'No title';
                const date = document.querySelector('.J54Vt').nextSibling ?? 'No date';
                const urls = Array.from(document.querySelectorAll(sel)).map((row) => {
                  return {
                    sitemap: origin,
                    'report name': reportName,
                    url: row.innerText.replace(//g, ''),
                    date: date.textContent,
                  };
                });
                return Promise.resolve(urls);
              },
              [reportSelector, reportTitle, sitemap],
            );

            // Push sitemap coverage results to holding array
            sitemapRes.push(...indReportUrls);
          }
          // Force delay between sitemaps checks to prevent GSC detecting automated activity
          await new Promise((r) => setTimeout(r, 4000));
        }

        // Change date format from reportUrls objects
        const finalSitemapRes = sitemapRes.map(({ date, ...rest }) => {
          if (americanDate) {
            const lastUpdated = formatDate(date, 'MM-DD-YYYY', americanDateChange ? 'DD-MM-YYYY' : 'MM-DD-YYYY');
            return { ...rest, 'last updated': lastUpdated };
          } else {
            const lastUpdated = formatDate(date, 'DD-MM-YYYY', 'DD-MM-YYYY');
            return { ...rest, 'last updated': lastUpdated };
          }
        });
        // Write summary sitemap coverage in CSV
        if (finalSitemapRes.length) {
          writeFile(`./${file}/sitemaps-${file}_${currentDate()}.csv`, jsonToCsv(finalSitemapRes));
          writeFile(`./${file}/sum-sitemaps-${file}_${currentDate()}.csv`, jsonToCsv(summarySitemaps));
          console.log(ansis.green('Sitemap CSV outputs created!'));
          // Add sitemap data to Excel doc as tabs
          createExcelTab(summarySitemaps, workbook, `${short}_SUM_MAPS`);
          createExcelTab(finalSitemapRes, workbook, `${short}_MAPS`);
        }
      }
    }
    // Add indexed summary tab if there was data for more than 1 property
    if (indexedSum.length) {
      console.log('Adding indexed summary', indexedSum.length);

      createExcelTab(indexedSum, workbook, `Indexed_summary_ALL`);

      // Add summary tab at the beginning
      let tabs = workbook.worksheets;
      let last = tabs.length - 1;
      tabs[last].orderNo = 0;
    }
    // Close Browser
    await context.close();

    // Export Excel File
    await workbook.xlsx.writeFile(`index-results_${currentDate()}.xlsx`);
    console.log(ansis.bgGreenBright('All data extracted - Find your results in the index-resuls.xlsx file'));
  } else {
    console.log(ansis.red('No properties were selected.'));
    process.exit();
  }
})();
