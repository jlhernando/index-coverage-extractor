/* Modules */
import { email, pass, site } from './credentials.js' // Import Google Search Credentials - EDIT CREDENTIALS.JS
import { writeFileSync } from 'fs' // Module to access the File System - Extract only ones needed
import { firefox } from 'playwright' // Choose browser - Currently firefox but you can choose 'chromium' or 'webkit'.
import { parse } from 'json2csv' // Convert JSON to CSV
import { reports } from './report-types.js' // Custom array of objects with specific params to access GSC reports

/* Settings */
const resource = encodeURIComponent(site) // Encode it to create the correct URL
const access = `https://search.google.com/search-console/index/drilldown?resource_id=${resource}&item_key=` // URL to access each report

/* Data */
const results = [] // Empty holding array to push report results
const summary = [] // Empty holding array to push summary results per report

// Asynchronous IIFE - Immeditaly invoked function expression
;(async () => {
  console.log('Launching browser...') // Initial log to let the user know the script is running

  // Setup browser
  const browser = await firefox.launch({ headless: true }) // Switch headless to false if you want to see the broswer automation
  const context = await browser.newContext()

  // Setup New Page
  let page = await context.newPage()

  // Go to the initial Search Console Page
  await page.goto('https://search.google.com/search-console/welcome')

  // Find and submit Email input
  console.log('Inputing email...')
  await page.type('css=input', email)
  await page.keyboard.press('Enter')

  // Find and submit Password input
  console.log('Inputing password...')
  await page.waitForSelector('[name=password]')
  await page.type('[name=password]', pass, { delay: 50 })
  await page.keyboard.press('Enter')

  // Wait until navigating to GSC property
  await page.waitForSelector('text="Welcome to Google Search Console"')

  // Loop through report categories
  for (const { category, name, param } of reports) {
    // Access individual report
    await page.goto(`${access}${param}`)

    // Extract URLs from each report
    const reportUrls = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.OOHai')).map((url) =>
        url.innerText.replace(//g, '')
      )
    )
    // Log extraction result
    console.log(`Extracting ${name} report - ${reportUrls.length} URLs found`)

    // If there is data in the report create unique objects (future CSV rows) per URL
    if (reportUrls.length !== 0) {
      // Extract total number of URLs reported by GSC
      const total = await page.evaluate(() => {
        const num = Array.from(document.querySelectorAll('.CO3mte'))
        return parseInt(
          num[num.length - 1].attributes.title.textContent.replace(',', '')
        )
      })
      // Create unique objects per URL (for future CSV rows)
      reportUrls.forEach((url) =>
        results.push({ status: category, 'report name': name, url })
      )

      // Create summary object per report type (for future CSV rows)
      summary.push({
        status: category,
        'report name': name,
        '# URLs extracted': reportUrls.length,
        'total reported': total,
        'extraction ratio': ((reportUrls.length / total) * 100).toFixed(2) + '%'
      })
    }
  }

  // Close Browser
  await browser.close()

  // Parse JSON to CSV
  const csv = parse(results) // Parse results JSON to CSV
  writeFileSync('./coverage.csv', csv) // Write file
  const sum = parse(summary) // Parse summary JSON to CSV
  writeFileSync('./summary.csv', sum) // Write file
  console.log('coverage.csv & summary.csv created!')
})()
