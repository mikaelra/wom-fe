import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const ios = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/appleShop', () => ({ isIosApp: () => ios.value }));
vi.mock('@/lib/moonNotifications', () => ({ syncMoonNotifications: vi.fn() }));

import { syncMoonNotifications } from '@/lib/moonNotifications';
import MoonNotifications from '@/components/MoonNotifications';

const sync = vi.mocked(syncMoonNotifications);

afterEach(() => vi.clearAllMocks());

describe('MoonNotifications', () => {
  it('does nothing outside the iOS app', () => {
    ios.value = false;
    const { container } = render(<MoonNotifications />);
    expect(container.innerHTML).toBe('');
    expect(sync).not.toHaveBeenCalled();
  });

  it('schedules once in the iOS app, and a failure stays quiet', () => {
    ios.value = true;
    sync.mockRejectedValue(new Error('no'));
    render(<MoonNotifications />);
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
