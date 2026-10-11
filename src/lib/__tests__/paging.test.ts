import { describe, expect, it } from 'vitest';
import { formatEnded, pageCount, rowNumber } from '@/lib/paging';

describe('paging', () => {
  it('counts pages, at least one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(23, 10)).toBe(3);
  });

  it('numbers rows from 1 for the newest, across pages', () => {
    expect(rowNumber(1, 0)).toBe(1);
    expect(rowNumber(3, 0, 10)).toBe(21);
    expect(rowNumber(2, 4, 5)).toBe(10);
  });

  it('shows the time alone today, the date before, a dash for nonsense', () => {
    expect(formatEnded(new Date().toISOString())).toMatch(/^\d{2}[:.]\d{2}/);
    expect(formatEnded('2020-01-02T10:00:00Z')).toMatch(/,/);
    expect(formatEnded('nope')).toBe('—');
  });
});
