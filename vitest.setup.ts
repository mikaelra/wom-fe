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
