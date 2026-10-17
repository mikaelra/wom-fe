import { describe, expect, it, vi } from 'vitest';
import { RANKED_STARTED_NOTIFICATION_ID, notifyRankedStarted } from '@/lib/matchNotice';

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));

function plugin(display: string) {
  return {
    checkPermissions: vi.fn().mockResolvedValue({ display }),
    schedule: vi.fn().mockResolvedValue({ notifications: [] }),
  };
}

describe('notifyRankedStarted', () => {
  it('shows "Game started." right away when allowed', async () => {
    const p = plugin('granted');
    const now = new Date('2026-10-17T12:00:00Z');
    await notifyRankedStarted(p as never, now);
    expect(p.schedule).toHaveBeenCalledWith({
      notifications: [
        {
          id: RANKED_STARTED_NOTIFICATION_ID,
          title: 'World of Mythos',
          body: 'Game started.',
          schedule: { at: new Date(now.getTime() + 100) },
        },
      ],
    });
  });

  it('does nothing without permission (it never asks itself)', async () => {
    const p = plugin('denied');
    await notifyRankedStarted(p as never);
    expect(p.schedule).not.toHaveBeenCalled();
  });
});
