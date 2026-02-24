import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { friendlySiteName, formatDate, currentDate, jsonToCsv } from '../utils.js';

describe('friendlySiteName', () => {
  it('converts https URL to file-friendly name', () => {
    const result = friendlySiteName('https://example.com/');
    assert.equal(result.file, 'example_com');
    assert.equal(result.short, 'example_com');
  });

  it('converts http URL to file-friendly name', () => {
    const result = friendlySiteName('http://example.com/path/page');
    assert.equal(result.file, 'example_com_path_page');
  });

  it('converts sc-domain to DOM prefix', () => {
    const result = friendlySiteName('sc-domain:example.com');
    assert.equal(result.file, 'DOM_example_com');
  });

  it('truncates short name to 22 chars for Excel tab limit', () => {
    const result = friendlySiteName('https://very-long-subdomain.example.com/');
    assert.ok(result.short.length <= 22);
    assert.ok(result.file.length > 22);
  });

  it('handles URL with port', () => {
    const result = friendlySiteName('https://example.com:8080/');
    assert.equal(result.file, 'example_com_8080');
  });

  it('handles trailing slash removal', () => {
    const result = friendlySiteName('https://example.com/path/');
    assert.equal(result.file, 'example_com_path');
  });
});

describe('formatDate', () => {
  it('formats as DD/MM/YYYY', () => {
    assert.equal(formatDate(new Date(2024, 5, 15), 'DD/MM/YYYY'), '15/06/2024');
  });

  it('formats as MM/DD/YYYY', () => {
    assert.equal(formatDate(new Date(2024, 5, 15), 'MM/DD/YYYY'), '06/15/2024');
  });

  it('formats as YYYY-MM-DD (ISO)', () => {
    assert.equal(formatDate(new Date(2024, 5, 15), 'YYYY-MM-DD'), '2024-06-15');
  });

  it('defaults to DD/MM/YYYY when no format specified', () => {
    assert.equal(formatDate(new Date(2024, 5, 15)), '15/06/2024');
  });

  it('pads single-digit day and month', () => {
    assert.equal(formatDate(new Date(2024, 0, 5), 'DD/MM/YYYY'), '05/01/2024');
  });

  it('returns empty string for null', () => {
    assert.equal(formatDate(null, 'DD/MM/YYYY'), '');
  });

  it('returns empty string for invalid date', () => {
    assert.equal(formatDate(new Date('invalid'), 'DD/MM/YYYY'), '');
  });

  it('returns empty string for non-Date input', () => {
    assert.equal(formatDate('not-a-date', 'DD/MM/YYYY'), '');
  });
});

describe('currentDate', () => {
  it('returns date in DD-MM-YYYY format', () => {
    const result = currentDate();
    assert.match(result, /^\d{2}-\d{2}-\d{4}$/);
  });

  it('returns today\'s date', () => {
    const now = new Date();
    const expected = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    assert.equal(currentDate(), expected);
  });
});

describe('jsonToCsv', () => {
  it('converts simple array of objects to CSV', () => {
    const data = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const csv = jsonToCsv(data);
    const lines = csv.split('\n');
    assert.equal(lines[0], 'name,age');
    assert.equal(lines[1], 'Alice,30');
    assert.equal(lines[2], 'Bob,25');
  });

  it('returns empty string for empty array', () => {
    assert.equal(jsonToCsv([]), '');
  });

  it('returns empty string for null', () => {
    assert.equal(jsonToCsv(null), '');
  });

  it('handles single object', () => {
    const csv = jsonToCsv([{ url: 'https://example.com' }]);
    const lines = csv.split('\n');
    assert.equal(lines[0], 'url');
    assert.equal(lines[1], 'https://example.com');
  });

  it('escapes values containing commas', () => {
    const csv = jsonToCsv([{ name: 'Doe, John', age: 30 }]);
    const lines = csv.split('\n');
    assert.equal(lines[1], '"Doe, John",30');
  });

  it('escapes values containing double quotes', () => {
    const csv = jsonToCsv([{ name: 'She said "hello"' }]);
    const lines = csv.split('\n');
    assert.equal(lines[1], '"She said ""hello"""');
  });

  it('escapes values containing newlines', () => {
    const csv = jsonToCsv([{ text: 'line1\nline2' }]);
    const lines = csv.split('\n');
    // First line is header, second line starts with quote
    assert.ok(csv.includes('"line1\nline2"'));
  });

  it('handles null values in objects', () => {
    const csv = jsonToCsv([{ a: null, b: 'test' }]);
    const lines = csv.split('\n');
    assert.equal(lines[1], ',test');
  });

  it('handles undefined values in objects', () => {
    const csv = jsonToCsv([{ a: undefined, b: 'test' }]);
    const lines = csv.split('\n');
    assert.equal(lines[1], ',test');
  });

  it('produces correct output for typical GSC data', () => {
    const data = [
      { status: 'Indexed', 'report name': 'All Indexed URLs', url: 'https://example.com/page1', 'last updated': '15-06-2024' },
      { status: 'Indexed', 'report name': 'All Indexed URLs', url: 'https://example.com/page2', 'last updated': '15-06-2024' },
    ];
    const csv = jsonToCsv(data);
    const lines = csv.split('\n');
    assert.equal(lines.length, 3); // header + 2 rows
    assert.equal(lines[0], 'status,report name,url,last updated');
    assert.equal(lines[1], 'Indexed,All Indexed URLs,https://example.com/page1,15-06-2024');
  });
});
