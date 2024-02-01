/* Modules */
import { email, pass, site } from './credentials.js'; // Import Google Search Credentials - EDIT CREDENTIALS.JS
import { writeFile, mkdir } from 'fs/promises'; // Module to access the File System - Extract only ones needed
import { existsSync } from 'fs'; // File System sync
import { firefox } from 'playwright'; // Choose browser - Currently firefox but you can choose 'chromium' or 'webkit'.
import { parse } from 'json2csv'; // Convert JSON to CSV
import { reportsNames } from './report-names.js'; // Custom array of objects with specific params to access GSC reports
import Excel from 'exceljs'; // Create Excel docs in JS
import moment from 'moment'; // Handle dates easily
import * as readline from 'node:readline/promises'; // Create native NodeJS user prompts
import { stdin as input, stdout as output } from 'node:process'; // Create user prompts
import prompt from 'enquirer'; // Create prompts with more custom options
import chalk from 'chalk'; // Add colors to console logs

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
const warning = chalk.hex('#FFA500');

/* Global functions */
// Create file system friendly names for properties
const friendlySiteName = (str) => {
  const friendlystr = str
    .replace(/(http.*:\/\/)/g, '')
    .replace(/(sc-domain)/g, 'DOM')
    .replace(/\//g, '_')
    .replace(/\_$/g, '')
    .replaceAll(/\.|:/g, '_');

  const short = friendlystr.slice(0, 22); // To fit Excel tab char limit

  return { file: friendlystr, short };
};

// Asynchronous IIFE - Immeditaly invoked function expression
(async () => {
  console.log('Launching browser...'); // Initial log to let the user know the script is running

  // Setup browser
  const browser = await firefox.launch({ headless: headless }); // Switch headless to false if you want to see the broswer automation
  const context = await browser.newContext();

  // Setup New Page
  let page = await context.newPage();

  // Go to the initial Search Console Page
  await page.goto('https://search.google.com/search-console/welcome?hl=en');

  // Find and submit Email input
  let gmail = '';

  try {
    // Check if there is an email in credentials file or let user add email in prompt
    if (!email) {
      const rl = readline.createInterface({ input, output });
      gmail = await rl.question(warning('-> Input your Google Account email: '));
      rl.close();
    } else gmail = email;

    // Input email
    await page.getByRole('textbox', { name: 'Email or phone' }).type(gmail, { delay: 50 });
    await page.keyboard.press('Enter');
    console.log('Inputing email...');

    // Check if there was an error message / issue
    await page.waitForResponse((resp) =>
      resp.url().includes('https://accounts.google.com/v3/signin/_/AccountsSignInUi/')
    );
    if (await page.getByText('Couldn’t find your Google Account').isVisible()) {
      console.log(
        chalk.red('Google couldn’t find your Google Account. Check the email you have added and run the script again.')
      );
      process.exit();
    }
  } catch (error) {
    console.log(chalk.red('There was an issue with you email address.', error));
    process.exit();
  }
  // Find and submit Password input
  let password = '';

  try {
    if (!pass) {
      const rl = readline.createInterface({ input, output });
      password = await rl.question(warning('-> Input your Google Account password: '));
      rl.close();
    } else password = pass;

    await page.getByRole('textbox', { name: 'Enter your password' }).type(password, { delay: 50 });
    await page.keyboard.press('Enter');
    console.log('Inputing password...');

    // Check if there was an error message / issue
    await page.waitForResponse((resp) =>
      resp.url().includes('https://accounts.google.com/v3/signin/_/AccountsSignInUi/')
    );
    if (await page.getByText('Wrong password').isVisible()) {
      console.log(chalk.red('Wrong Password. Run the script and try again.'));
      process.exit();
    }
  } catch (error) {
    console.log(chalk.red('There was an issue with your password: ', error));
    process.exit();
  }

  // Detect if there is 2-factor authentication
  await page.waitForNavigation({ waitUntil: 'load' });
  const twoStepURL = 'https://accounts.google.com/signin/v2/challenge/';
  if (page.url().includes(twoStepURL)) {
    try {
      console.log(
        warning(
          'You have 2-step Verification enabled. Check your device to pass to the next step. The script will only wait for 30 seconds'
        )
      );
      // Timeout of 10 seconds so the user can read the log message + 30secs automatic for the next selector
      await page.waitForTimeout(10000);
    } catch (e) {
      console.log(chalk.red('There was an issue with 2-step Verification: ', e));
    }
  } else {
    console.log(chalk.green('No 2-step Verification was detected. Accessing Search Console...'));
  }

  // Try/Catch block in case the 2-factor auth fails or times out
  try {
    // Wait for Welcome URL
    await page
      .waitForURL('https://search.google.com/search-console/welcome?hl=en')
      .catch((err) => console.log('There was an issue with your password: ', err));
    // Wait until GSC property is loaded
    await page.waitForSelector('text="Welcome to Google Search Console"');
    console.log(chalk.bgGreen('GSC access sucessful!'));

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
      const promptMulti = new prompt.MultiSelect({
        name: 'gscprops',
        message: 'Select properties (min. 1)',
        choices: gscProps,
      });
      const selectedProps = await promptMulti
        .run()
        .catch((e) => console.log(chalk.red('No properties were selected: ', e)));
      sites.push(...selectedProps);
    }

    // Create Excel doc
    const workbook = new Excel.Workbook();

    const createExcelTab = async (arr, wb, tabName) => {
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

    // Loop through site choices
    for (let site of sites) {
      // // Check if it's a domain property or URL prefix property
      // if (!site.startsWith('http')) site = 'sc-domain:' + site;
      console.log(chalk.bgCyanBright('Extracting data from: ', site));

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
		  var ruleCheckNotIndexed = 'ds:10';

          // Isolate the right script that match rules
          var notIndexed = rawArray.filter((s) => s.includes(ruleNotIndexed))[1];
          var warning = rawArray.filter((s) => s.includes(ruleWarning))[1];
		  var checkNotIndexed = rawArray.filter((s) => s.includes(ruleCheckNotIndexed))[1];
          var script = notIndexed.concat(warning).concat(checkNotIndexed);
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
        [site]
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
          [reportSelector, category, param]
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
          const lastUpdated = moment(updated, 'MM-DD-YYYY').format('DD-MM-YYYY');
          const americanlastUpdated = moment(updated, 'MM-DD-YYYY').format('MM-DD-YYYY');
          return { ...rest, 'last updated': americanDateChange ? lastUpdated : americanlastUpdated };
        } else {
          const lastUpdated = moment(updated, 'DD-MM-YYYY').format('DD-MM-YYYY');
          return { ...rest, 'last updated': lastUpdated };
        }
      });

      // Parse JSON to CSV if there is data to parse
      if (finalResults.length) {
        writeFile(`./${file}/coverage_${file}_${moment().format('DD-MM-YYYY')}.csv`, parse(finalResults)); // Parse results JSON to CSV
        writeFile(`./${file}/summary_${file}_${moment().format('DD-MM-YYYY')}.csv`, parse(summary)); // Parse summary JSON to CSV
        console.log(chalk.green('URL Coverage CSV outputs created!'));
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
            sitemap
          )}`;
          // Go to Sitemap report and log URL
          const reportPage = await page.goto(sitemapReport);
          console.log(chalk.bgBlue(`Extracting coverage data from sitemap: ${sitemap}`));
          // Intercept Doc Netowork request (raw HTML)
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
            [sitemap]
          );

          // Add individual sitemap summary numbers to summarySitemaps array
          summarySitemaps.push(sitemapNums);

          // Access & Extract Indexed URLs from sitemap
          const indexedReport = `https://search.google.com/search-console/index/drilldown?resource_id=${resource}&pages=SITEMAP&sitemap=${encodeURIComponent(
            sitemap
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
            [reportSelector, reportStatus, reportTitle, sitemap]
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
              [reportSelector, reportTitle, sitemap]
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
            const americanlastUpdated = moment(date, 'MM-DD-YYYY').format('MM-DD-YYYY');
            const lastUpdated = moment(date, 'MM-DD-YYYY').format('DD-MM-YYYY');
            return { ...rest, 'last updated': americanDateChange ? lastUpdated : americanlastUpdated };
          } else {
            const lastUpdated = moment(date, 'DD-MM-YYYY').format('DD-MM-YYYY');
            return { ...rest, 'last updated': lastUpdated };
          }
        });
        // Write summary sitemap coverage in CSV
        if (finalSitemapRes.length) {
          writeFile(`./${file}/sitemaps-${file}_${moment().format('DD-MM-YYYY')}.csv`, parse(finalSitemapRes)); // Parse sitemap results from JSON to CSV
          writeFile(`./${file}/sum-sitemaps-${file}_${moment().format('DD-MM-YYYY')}.csv`, parse(summarySitemaps));
          console.log(chalk.green('Sitemap CSV outputs created!'));
          // Add sitemap data to Excel doc as tabs
          createExcelTab(summarySitemaps, workbook, `${short}_SUM_MAPS`);
          createExcelTab(finalSitemapRes, workbook, `${short}_MAPS`);
        }
      }
    }
    // Close Browser
    await browser.close();

    // Export Excel File
    await workbook.xlsx.writeFile(`index-results_${moment().format('DD-MM-YYYY')}.xlsx`);
    console.log(chalk.bgGreenBright('All data extracted - Find your results in the index-resuls.xlsx file'));
  } catch (error) {
    console.log(chalk.bgRedBright(`There was an error running the script: ${error}`));
    process.exit();
  }
})();
