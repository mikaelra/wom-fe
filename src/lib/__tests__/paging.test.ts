import { describe, expect, it } from 'vitest';
import { formatEnded, pageCount, rowNumber } from '@/lib/paging';

describe('paging', () => {
  it('counts pages, at least one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(23, 10)).toBe(3);
  });

  it('numbers rows by when they were played: the newest #n, the first #1', () => {
    expect(rowNumber(23, 1, 0)).toBe(23); // the newest, top of page 1
    expect(rowNumber(23, 3, 2, 10)).toBe(1); // the first, last row of page 3
    expect(rowNumber(12, 2, 4, 5)).toBe(3);
  });

  it('shows the time alone today, the date before, a dash for nonsense', () => {
    expect(formatEnded(new Date().toISOString())).toMatch(/^\d{2}[:.]\d{2}/);
    expect(formatEnded('2020-01-02T10:00:00Z')).toMatch(/,/);
    expect(formatEnded('nope')).toBe('—');
  });
});
