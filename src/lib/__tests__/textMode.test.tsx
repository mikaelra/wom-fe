import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { getTextMode, setTextMode, useTextMode } from '@/lib/textMode';

beforeEach(() => {
  localStorage.clear();
});

describe('text mode', () => {
  it('is off until turned on', () => {
    expect(getTextMode()).toBe(false);
    setTextMode(true);
    expect(getTextMode()).toBe(true);
    setTextMode(false);
    expect(getTextMode()).toBe(false);
  });

  it('is read after mount', () => {
    setTextMode(true);
    expect(renderHook(() => useTextMode()).result.current).toBe(true);
  });
});
