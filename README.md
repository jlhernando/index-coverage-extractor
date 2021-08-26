# Google Search Console Index Coverage Extractor
This script allows users of Google Search Console (GSC) to extract all the different reports from the [Index Coverage report section](https://support.google.com/webmasters/answer/7440203?hl=en) of the platform and the [Sitemap Coverage report section](https://support.google.com/webmasters/answer/7451001?hl=en&ref_topic=9456557). I wrote a blog post about [why I built this script](https://jlhernando.com/blog/index-coverage-extractor/).

## Reports that extracts
### Error
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

### Warning
- [x] Indexed, though blocked by robots.txt
- [x] Page indexed without content

### Valid
- [x] Submitted and indexed
- [x] Indexed, not submitted in sitemap

### Excluded
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

In order to extract the coverage data from your website/property update the credential.js file with your Search Console credentials.

![Update credentials.js with your Search Console user & password](https://jlhernando.com/img/credentials.jpg "update credentials.js with your Search Console user & password")

After that you can run the script with *npm start* command from your terminal.
```bash
npm start
```
You will see the processing messages in your terminal while the script runs.

![Index Coverage Extractor in action](https://jlhernando.com/img/index-coverage-headless.jpg "Index Coverage Extractor in action")

## Settings
The script extracts the "Latest updated" dates that GSC provides. Hence the date can be in two different formats: American date (mm/dd/yyyy) and European date (dd/mm/yyyy). Therefore there is an option to set which date format you would like the script to output the dates:
![Date format settings for extraction](https://jlhernando.com/img/date-format-settings.png "GSC date format settings for extarction")

The default setting assumes your property shows the dates in European date format (dd/mm/yyyy). If your GSC property shows the dates in American date format then you would need to change ``americanDate = true``. Also if your property is in American date format but you'd like to change it to European date format you can do that by changing ``americanDateChange = true``.

## Output
The script will create a "results.xlsx" file, a "coverage.csv" file and a "summary.csv" file. 

The "results.xlsx" file will contain 3 tabs: 
- A summary of the index coverage extraction.
- The individual URLs extracted from the Coverage section.
- A summary of the index coverage extraction from the Sitemap section.
- The individual URLs extracted from the Sitemap section.

![Results Excel report detail](https://jlhernando.com/img/results-excel.png "index coverage report export Excel detail")

The "coverage.csv" will contain all the URLs that have been extracted from each individual coverage report.
![Coverage report detail csv](https://jlhernando.com/img/coverage-csv.jpg "index coverage report export detail csv")

The "summary.csv" will contain the amount of urls per report that have been extracted, the total number that GSC reports in the user interface (either the same or higher) and an "extraction ratio" which is a division between the URLs extracted and the total number of URLs reported by GSC. 

![Coverage report summary csv](https://jlhernando.com/img/coverage-summary.jpg "index coverage report export summary csv")
This is useful because GSC has an export limit of 1000 rows per report. Hence, the "extraction ratio" may be small compared to the total amount of total URLs within a specific report.

The "sitemap.csv" will contain all the URLs that have been extracted from each individual sitemap coverage report.
![Coverage report detail csv](https://jlhernando.com/img/coverage-csv.jpg "index coverage report export detail csv")
