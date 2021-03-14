export const reports = [
  {
    category: 'Valid',
    name: 'Indexed, not submitted in sitemap',
    param: 'CAMYAiAB'
  },
  {
    category: 'Valid',
    name: 'Submitted and indexed',
    param: 'CAMYASAB'
  },
  {
    category: 'Error',
    name: 'Server error (5xx)',
    param: 'CAMYEyAE'
  },
  {
    category: 'Error',
    name: 'Submitted URL not found (404)',
    param: 'CAMYHyAE'
  },
  {
    category: 'Error',
    name: 'Submitted URL marked ‘noindex’',
    param: 'CAMYHCAE'
  },
  {
    category: 'Error',
    name: 'Redirect error',
    param: 'CAMYFCAE'
  },
  {
    category: 'Error',
    name: 'Submitted URL seems to be a Soft 404',
    param: 'CAMYICAE'
  },
  {
    category: 'Error',
    name: 'Submitted URL has crawl issue',
    param: 'CAMYISAE'
  },
  {
    category: 'Error',
    name: 'Submitted URL blocked by robots.txt',
    param: 'CAMYGyAE'
  },
  {
    category: 'Error',
    name: 'Submitted URL returned 403',
    param: 'CAMYNSAE'
  },
  {
    category: 'Error',
    name: 'Submitted URL blocked due to other 4xx issue',
    param: 'CAMYNiAE'
  },
  {
    category: 'Error',
    name: 'Submitted URL returns unauthorised request (401)',
    param: 'CAMYHiAE'
  },
  {
    category: 'Warning',
    name: 'Indexed, though blocked by robots.txt',
    param: 'CAMYGyAE'
  },
  {
    category: 'Warning',
    name: 'Page indexed without content',
    param: 'CAMYMiAD'
  },
  {
    category: 'Excluded',
    name: 'Blocked by robots.txt',
    param: 'CAMYByAC'
  },
  {
    category: 'Excluded',
    name: 'Excluded by ‘noindex’ tag',
    param: 'CAMYCCAC'
  },
  {
    category: 'Excluded',
    name: 'Alternate page with proper canonical tag',
    param: 'CAMYGCAC'
  },
  {
    category: 'Excluded',
    name: 'Crawled - currently not indexed',
    param: 'CAMYFyAC'
  },
  {
    category: 'Excluded',
    name: 'Page with redirect',
    param: 'CAMYCyAC'
  },
  {
    category: 'Excluded',
    name: 'Not found (404)',
    param: 'CAMYDSAC'
  },
  {
    category: 'Excluded',
    name: 'Duplicate, Google chose different canonical than user',
    param: 'CAMYECAC'
  },
  {
    category: 'Excluded',
    name: 'Duplicate without user-selected canonical',
    param: 'CAMYDyAC'
  },
  {
    category: 'Excluded',
    name: 'Duplicate, submitted URL not selected as canonical',
    param: 'CAMYGSAC'
  },
  {
    category: 'Excluded',
    name: 'Soft 404',
    param: 'CAMYDiAC'
  },
  {
    category: 'Excluded',
    name: 'Discovered - currently not indexed',
    param: 'CAMYFiAC'
  },
  {
    category: 'Excluded',
    name: 'Blocked due to access forbidden (403)',
    param: 'CAMYMyAC'
  },
  {
    category: 'Excluded',
    name: 'Blocked due to other 4xx issue',
    param: 'CAMYNCAC'
  },
  {
    category: 'Excluded',
    name: 'Blocked due to unauthorized request (401)',
    param: 'CAMYCiAC'
  },
  {
    category: 'Excluded',
    name: 'Crawl anomaly',
    param: 'CAMYJyAC'
  }
]
