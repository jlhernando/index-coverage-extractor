# Google Search Console Index Coverage Extractor

This script allows users of Google Search Console (GSC) to extract all the different reports from the [Index Coverage report section](https://support.google.com/webmasters/answer/7440203?hl=en) of the platform and the [Sitemap Coverage report section](https://support.google.com/webmasters/answer/7451001?hl=en&ref_topic=9456557). I wrote a blog post about [why I built this script](https://jlhernando.com/blog/index-coverage-extractor/).

## Installing and running the script

The script uses the ECMAScript modules import/export syntax so double check that you are above version 14 to run the script.

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

You will get a prompt message in your terminal asking for your Google Account email address and your password. This is to login automatically through the headless browser.

![Prompt email and password](/img/index-coverage-extractor-email-pass-prompt.png)

If you have 2-step Verification enabled it will prompt a warning message and wait for 30 seconds to give the user time to verify access through one of your devices.

Once verified and logged in, the script will extract all the list of GSC properties present in your account. At this point you will have to choose which properties you would like to extract data from.

![Select GSC properties](/img/select-gsc-props-terminal.png)

Select one or multiple properties using the spacebar.

When this is done, your will see the processing messages in your terminal while the script runs.

![Messages while running index coverage script](/img/running-index-cov-script.png)

## Output

The script will create a "index-results\_${date}.xlsx" Excel file. The file will contain 1 summary tab with the number of Indexed URLs per property when you choose more than 1 property and up to 4 tabs per property including:

- A summary of the index coverage extraction of the property.
- The individual URLs extracted from the Coverage section.
- A summary of the index coverage extraction from the Sitemap section.
- The individual URLs extracted from the Sitemap section.

![Results Excel report detail](https://jlhernando.com/img/results-excel.png 'index coverage report export Excel detail')

The "coverage.csv" will contain all the URLs that have been extracted from each individual coverage report.
![Coverage report detail csv](https://jlhernando.com/img/coverage-csv.jpg 'index coverage report export detail csv')

The "summary.csv" will contain the amount of urls per report that have been extracted, the total number that GSC reports in the user interface (either the same or higher) and an "extraction ratio" which is a division between the URLs extracted and the total number of URLs reported by GSC.

![Coverage report summary csv](https://jlhernando.com/img/coverage-summary.jpg 'index coverage report export summary csv')
This is useful because GSC has an export limit of 1000 rows per report. Hence, the "extraction ratio" may be small compared to the total amount of total URLs within a specific report.

The "sitemap.csv" will contain all the URLs that have been extracted from each individual sitemap coverage report.
![Coverage report detail csv](https://jlhernando.com/img/coverage-csv.jpg 'index coverage report export detail csv')

The "sum-sitemap.csv" will contain a summary of the top-level coverage numbers per sitemap reported by GSC.

## Additional optional settings

### _credentials.js File_

#### Email & Password

You can choose to fill in the `credentials.js` file with your email and password to avoid adding them in the terminal during the running of the script.

![Update credentials.js with your Search Console user & password](https://jlhernando.com/img/credentials.jpg 'update credentials.js with your Search Console user & password')

#### Sites

Verified GSC properties can be added in the `credentials.js` file. You can add them as a single string for only 1 property OR as an array for multiple properties.

Remember that if you want to extract data from a Domain Property you should add `sc-domain:` in front of the domain (_sc-domain:yourdomain.com_).

```js
// Single property
const site = 'https://yoursite.com/';

// OR Multiple properties
const site = ['https://yoursite.com/', 'sc-domain:yourdomain.com'];
```

### Headless

In some cases you might want to see how the browser automation is happenning in real-time. For that, you can change the `headless` variable.

```js
// Change to false to see the automation
const headless = false;
```

### sitemapExtract

Since each GSC property can contain many sitemaps and this can take more time, you can choose wether you would like to extract sitemap coverage data or not.

```js
// Change to false to prevent the script from extracting sitemap coverage data
const sitemapExtract = false;
```

### Dates

The script extracts the "Latest updated" dates that GSC provides. Hence the date can be in two different formats: American date (mm/dd/yyyy) and European date (dd/mm/yyyy). Therefore there is an option to set which date format you would like the script to output the dates:
![Date format settings for extraction](https://jlhernando.com/img/date-format-settings.png 'GSC date format settings for extarction')

The default setting assumes your property shows the dates in European date format (dd/mm/yyyy). If your GSC property shows the dates in American date format then you would need to change `americanDate = true`. Also if your property is in American date format but you'd like to change it to European date format you can do that by changing `americanDateChange = true`.

## Notable changes in the last version

A big difference in this version is that it will only extract the reports that are available instead of looping through all the coverage reports GSC offers (old `report-types.js`). This minimises the amount of requests to Google Search Console tot he absolute minimum required.

## Reports that extracts

### Indexed

- [x] All Indexed URLs

#### (Old Warning reports)

- [x] Indexed, though blocked by robots.txt
- [x] Page indexed without content

### Not indexed

- [x] Excluded by ‘noindex’ tag
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
- [x] Submitted URL marked ‘noindex’
- [x] Submitted URL seems to be a Soft 404
- [x] Submitted URL has crawl issue
- [x] Submitted URL not found (404)
- [x] Submitted URL returned 403
- [x] Submitted URL returns unauthorized request (401)
- [x] Submitted URL blocked due to other 4xx issue
