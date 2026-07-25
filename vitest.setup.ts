import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// vitest doesn't expose global afterEach/etc by default (test.globals is
// off), so @testing-library/react's usual auto-cleanup detection doesn't
// fire on its own -- without this, each test's rendered DOM leaks into the
// next one in the same file.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia -- default to "no preference" so
// prefers-reduced-motion/prefers-color-scheme checks (e.g. WheelSpinModal)
// don't throw. Individual tests can still override via vi.stubGlobal.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
