/**
 * Utility functions for index-coverage-extractor
 */

/**
 * Create file system friendly names for GSC properties.
 * @param {string} str - GSC property URL
 * @returns {{ file: string, short: string }}
 */
export const friendlySiteName = (str) => {
  const friendlystr = str
    .replace(/(http.*:\/\/)/g, '')
    .replace(/(sc-domain)/g, 'DOM')
    .replace(/\//g, '_')
    .replace(/\_$/g, '')
    .replaceAll(/\.|:/g, '_');

  const short = friendlystr.slice(0, 22); // To fit Excel tab char limit

  return { file: friendlystr, short };
};

/**
 * Parse a date string and reformat it.
 * Supports DD/MM/YYYY and MM/DD/YYYY input formats.
 * @param {string} dateStr - Date string with / or - separators
 * @param {string} inputFormat - 'DD-MM-YYYY' or 'MM-DD-YYYY'
 * @param {string} outputFormat - 'DD-MM-YYYY' or 'MM-DD-YYYY'
 * @returns {string}
 */
export const formatDate = (dateStr, inputFormat, outputFormat) => {
  if (!dateStr || dateStr === 'No date') return dateStr;

  // Normalize separators to /
  const normalized = dateStr.replace(/-/g, '/');
  const parts = normalized.split('/');
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return dateStr;

  let day, month, year;

  if (inputFormat === 'MM-DD-YYYY') {
    [month, day, year] = parts;
  } else {
    // Default: DD-MM-YYYY
    [day, month, year] = parts;
  }

  // Pad single digits
  day = day.padStart(2, '0');
  month = month.padStart(2, '0');

  // Handle 2-digit years
  if (year.length === 2) {
    year = `20${year}`;
  }

  if (outputFormat === 'MM-DD-YYYY') {
    return `${month}-${day}-${year}`;
  }
  // Default output: DD-MM-YYYY
  return `${day}-${month}-${year}`;
};

/**
 * Get current date formatted as DD-MM-YYYY.
 * @returns {string}
 */
export const currentDate = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
};

/**
 * Convert an array of flat objects to CSV string.
 * Handles commas, quotes, and newlines in values (RFC 4180).
 * @param {Object[]} arrayOfObjects
 * @returns {string}
 */
export const jsonToCsv = (arrayOfObjects) => {
  if (!arrayOfObjects || arrayOfObjects.length === 0) return '';

  const headers = Object.keys(arrayOfObjects[0]);

  const escape = (val) => {
    const str = val == null ? '' : String(val);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const rows = arrayOfObjects.map((obj) =>
    headers.map((h) => escape(obj[h])).join(',')
  );

  return [headers.map(escape).join(','), ...rows].join('\n');
};
