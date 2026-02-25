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
    .replaceAll(/\.|:/g, '_')
    .replace(/[^\x20-\x7E]/g, '_') // Replace non-ASCII chars (accents, CJK, Cyrillic, etc.) with _
    .replace(/_{2,}/g, '_') // Collapse consecutive underscores
    .replace(/\_$/g, ''); // Remove trailing underscore again (may reappear after collapse)

  const short = Array.from(friendlystr).slice(0, 22).join(''); // Safe Unicode truncation (won't split surrogate pairs)

  return { file: friendlystr, short };
};

/**
 * Format a Date object according to the specified format string.
 * @param {Date} d - Date object
 * @param {string} format - 'DD/MM/YYYY', 'MM/DD/YYYY', or 'YYYY-MM-DD'
 * @returns {string}
 */
export const formatDate = (d, format) => {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  if (format === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
  if (format === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
  return `${dd}/${mm}/${yyyy}`;
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
