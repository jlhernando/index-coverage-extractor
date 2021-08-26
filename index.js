/* Modules */
import { email, pass, site } from './credentials.js' // Import Google Search Credentials - EDIT CREDENTIALS.JS
import { writeFile } from 'fs/promises' // Module to access the File System - Extract only ones needed
import { firefox } from 'playwright' // Choose browser - Currently firefox but you can choose 'chromium' or 'webkit'.
import { parse } from 'json2csv' // Convert JSON to CSV
import { reports } from './report-types.js' // Custom array of objects with specific params to access GSC reports
import Excel from 'exceljs'
import moment from 'moment';

/* Settings */
const americanDate = false // Variable to identify that the GSC property has American Date (mm/dd/yy). If your GSC property does not have American Date this variable should be set as false
const americanDateChange = false // Converts American Date (mm/dd/yy) in GSC to European Date (dd/mm/yy)
const resource = encodeURIComponent(site) // Encode it to create the correct URL
const access = `https://search.google.com/search-console/index/drilldown?resource_id=${resource}&item_key=` // URL to access each report
const reportSelector = '.OOHai' // CSS Selector from report Urls
const reportTitle = '.Iq9klb' // CSS Selector to extract report name from sitemap coverage reports
const reportStatus = '.DDFhO' // CSS Selector to extract report status from sitemap coverage reports

/* Data */
const results = [] // Empty holding array to push report results
const summary = [] // Empty holding array to push summary results per report
const sitemapRes = [] // Empty holding array to push coverage results per sitemap
const summarySitemaps = [] // Empty holding array to push coverage summary results per sitemap

  // Asynchronous IIFE - Immeditaly invoked function expression
  ; (async () => {
    console.log('Launching browser...') // Initial log to let the user know the script is running

    // Setup browser
    const browser = await firefox.launch({ headless: true }) // Switch headless to false if you want to see the broswer automation
    const context = await browser.newContext()

    // Setup New Page
    let page = await context.newPage()

    // Go to the initial Search Console Page
    await page.goto('https://search.google.com/search-console/welcome?hl=en')

    // Find and submit Email input
    console.log('Inputing email...')
    await page.type('css=input', email)
    await page.keyboard.press('Enter')

    // Find and submit Password input
    console.log('Inputing password...')
    await page.waitForSelector('[name=password]')
    await page.type('[name=password]', pass, { delay: 50 })
    await page.keyboard.press('Enter')

    // Detect if there is 2-factor authentication
    try {
      await page.waitForSelector('text=2-step', {
        timeout: 3000
      })
      console.log(
        'You have 2-step Verification enabled. Check your device to pass to the next step. The script will only wait for 30 seconds'
      )
      // Timeout of 10 seconds so the user can read the log message + 30secs automatic for the next selector
      await page.waitForTimeout(10000)
    } catch (e) {
      console.log(
        'No 2-step Verification was detected. Accessing Search Console...'
      )
    }

    // Try/Catch block in case the 2-factor auth fails or times out
    try {
      // Wait until navigating to GSC property
      await page.waitForSelector('text="Welcome to Google Search Console"')
      console.log('GSC access sucessful!');

      // Loop through report categories
      for (const { category, name, param } of reports) {
        // Access individual report
        await page.goto(`${access}${param}`)

        // Extract URLs from each report
        const reportUrls = await page.evaluate(
          ([sel, cat, rep]) => {
            // Extract Last Updated date
            const updated = document.querySelector('.zTJZxd.zOPr2c').innerText


            // Extract URls and build result object
            const arr = Array.from(document.querySelectorAll(sel)).map((url) => ({
              status: cat,
              'report name': rep,
              url: url.innerText.replace(//g, ''),
              updated: updated.replace(/[^\d|\/]+/g, '')

            }))
            return Promise.resolve(arr)
          },
          [reportSelector, category, name]
        )


        // Push urls from each report into results array for future CSV rows
        results.push(...reportUrls)

        // Log extraction result
        console.log(`Extracting ${name} report - ${reportUrls.length} URLs found`)

        // If there is data in the report create unique objects (future CSV rows) per URL
        if (reportUrls.length !== 0) {
          // Extract total number of URLs reported by GSC
          const total = await page.evaluate(() => {
            const num = Array.from(document.querySelectorAll('.CO3mte'))
            return Promise.resolve(
              parseInt(
                num[num.length - 1].attributes.title.textContent.replace(',', '')
              )
            )
          })

          // Create summary object per report type (for future CSV rows)
          summary.push({
            status: category,
            'report name': name,
            '# URLs extracted': reportUrls.length,
            'total reported': total,
            'extraction ratio':
              (reportUrls.length / total)
          })
        }
      }

      // Change date format from reportUrls objects
      const finalResults = results.map(({ updated, ...rest }) => {
        if (americanDate) {
          const lastUpdated = moment(updated, 'MM-DD-YYYY').format('DD-MM-YYYY')
          const americanlastUpdated = moment(updated, 'MM-DD-YYYY').format('MM-DD-YYYY')
          return { ...rest, 'last updated': americanDateChange ? lastUpdated : americanlastUpdated }
        } else {
          const lastUpdated = moment(updated, 'DD-MM-YYYY').format('DD-MM-YYYY')
          return { ...rest, 'last updated': lastUpdated }
        }
      })

      // Extract sitemap index coverage
      const sitemapEndPoint = `https://search.google.com/search-console/sitemaps?resource_id=${resource}`
      await page.goto(sitemapEndPoint)

      // Extract list of sitemaps into array
      const sitemaps = await page.evaluate(() => {
        const list = Array.from(document.querySelectorAll('.nJ0sOc.Ev7kWb.ptEsvc.s4dpBd'))
        return Promise.resolve(list.map(row => row.dataset.rowid))
      })


      // Loop through each sitemap report
      for (const sitemap of sitemaps) {
        // Individual sitemap report
        const sitemapReport = `https://search.google.com/search-console/index?resource_id=${resource}&pages=SITEMAP&sitemap=${encodeURIComponent(sitemap)}`
        // Go to Sitemap report and log URL
        const reportPage = await page.goto(sitemapReport)
        console.log(`Extracting coverage data from sitemap: ${sitemap}`);
        // Intercept Doc Netowork request (raw HTML)
        const source = await reportPage.text();
        // Find individual sitemap report keys through pattern
        const reportKeys = [...source.matchAll(/CAES\w+/g)]
        // Store individual sitemap report keys without duplicates
        const sitemapCoverageReports = new Set()
        // Loop through matchAll values to extract individual sitemap report keys
        for (const val of reportKeys) {
          sitemapCoverageReports.add(val[0])
        }

        // Get coverage summary of sitemap
        const sitemapNums = await page.evaluate((origin) => {
          const topNums = Array.from(document.querySelectorAll('.nnLLaf'))
          const extractNums = topNums.map(num => num.attributes.title.textContent)
          const summarySitemapCoverage = {
            sitemap: origin[0],
            error: parseInt(extractNums[0].replace(',', '')),
            'valid with warning': parseInt(extractNums[1].replace(',', '')),
            valid: parseInt(extractNums[2].replace(',', '')),
            excluded: parseInt(extractNums[3].replace(',', ''))
          }
          return Promise.resolve(summarySitemapCoverage)
        }, [sitemap])

        // Add individual sitemap summary numbers to summarySitemaps array
        summarySitemaps.push(sitemapNums);

        // Access each individual coverage reports from each sitemap
        for (const key of sitemapCoverageReports) {
          const indReport = `https://search.google.com/search-console/index/drilldown?resource_id=${resource}&item_key=${key}`
          await page.goto(indReport);

          // Extract report title and URLs from each report
          const indReportUrls = await page.evaluate(([sel, cat, title, origin]) => {
            const reportName = document.querySelector(title).innerText
            const status = document.querySelectorAll(cat)
            const statusCheck = status.length > 1 ? status[1].innerText : status[0].innerText
            const date = document.querySelector('.J54Vt').nextSibling
            const urls = Array.from(document.querySelectorAll(sel)).map(row => {
              return {
                sitemap: origin,
                status: statusCheck,
                'report name': reportName,
                url: row.innerText.replace(//g, ''),
                date: date.textContent
              }
            })
            return Promise.resolve(urls)
          }, [reportSelector, reportStatus, reportTitle, sitemap])

          // Push sitemap coverage results to holding array
          sitemapRes.push(...indReportUrls)

        }
      }

      // Change date format from reportUrls objects
      const finalSitemapRes = sitemapRes.map(({ date, ...rest }) => {
        if (americanDate) {
          const americanlastUpdated = moment(date, 'MM-DD-YYYY').format('MM-DD-YYYY')
          const lastUpdated = moment(date, 'MM-DD-YYYY').format('DD-MM-YYYY')
          return { ...rest, 'last updated': americanDateChange ? lastUpdated : americanlastUpdated }
        } else {
          const lastUpdated = moment(date, 'DD-MM-YYYY').format('DD-MM-YYYY')
          return { ...rest, 'last updated': lastUpdated }
        }
      })

      // Close Browser
      await browser.close()

      // Parse JSON to CSV
      writeFile('./coverage.csv', parse(finalResults)) // Parse results JSON to CSV
      writeFile('./summary.csv', parse(summary)) // Parse summary JSON to CSV
      writeFile('./sum-sitemaps.csv', parse(summarySitemaps)) // Write summary sitemap coverage in CSV
      writeFile('./sitemaps.csv', parse(finalSitemapRes)) // Parse sitemap results from JSON to CSV
      console.log('All CSV outputs created!')

      // Create Excel doc
      const workbook = new Excel.Workbook()

      const createExcelTab = async (arr, wb, tabName) => {

        const headers = Object.keys(arr[0]).map(name => ({ name, filterButton: true }))

        const sheet = wb.addWorksheet(tabName)

        sheet.addTable({
          name: tabName,
          ref: 'A1',
          headerRow: true,
          style: {
            showRowStripes: true,
          },
          columns: headers,
          rows: arr.map(obj => Object.values(obj))
        })

      }

      // Create each results tab
      createExcelTab(summary, workbook, 'summary')
      createExcelTab(finalResults, workbook, 'coverage')
      createExcelTab(summarySitemaps, workbook, 'summary_sitemaps')
      createExcelTab(finalSitemapRes, workbook, 'sitemaps')

      // Export Excel File
      await workbook.xlsx.writeFile('results.xlsx');
      console.log('results.xlsx created!');


    } catch (error) {
      console.log(`There was an error running the script: ${error}`)
      process.exit()
    }
  })()
