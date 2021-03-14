# Google Search Console Index Coverage Extractor
This script allows users of Google Search Console to extract all the different reports from the [Index Coverage report section](https://support.google.com/webmasters/answer/7440203?hl=en) of the platform.

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

## Output
The script will create a "coverage.csv" file and a "summary.csv" file. 

The "coverage.csv" will contain all the URLs that have been extracted from each individual coverage report.

The "summary.csv" will contain the amount of urls per report that have been extracted, the total number that GSC reports in the user interface (either the same or higher) and an "extraction ratio" which is a division between the URLs extracted and the total number of URLs reported by GSC. This is useful because GSC has an export limit of 1000 rows per report. Hence, the "extraction ratio" may be small compared to the total amount of total URLs within a specific report.