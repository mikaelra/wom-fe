import { describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));

import { daytime, moonNotificationSchedule, syncMoonNotifications } from '@/lib/moonNotifications';

describe('daytime', () => {
  it('leaves the day alone', () => {
    const at = new Date(2026, 9, 10, 14, 30);
    expect(daytime(at)).toEqual(at);
  });

  it('moves the small hours to nine the same morning', () => {
    expect(daytime(new Date(2026, 9, 10, 3, 15))).toEqual(new Date(2026, 9, 10, 9, 0));
  });

  it('moves the late evening to nine the next morning', () => {
    expect(daytime(new Date(2026, 9, 10, 22, 40))).toEqual(new Date(2026, 9, 11, 9, 0));
  });
});

describe('moonNotificationSchedule', () => {
  const now = new Date('2026-10-06T12:00:00Z');

  it('announces each merchant a day before the exact instant, never one already here', () => {
    const list = moonNotificationSchedule(now, 30);
    // Mercury-Venus (exact 2026-10-07 00:05Z) arrived 2026-10-06 00:05Z: already here.
    expect(list.map((n) => n.title)).toEqual(['New moon', 'Full moon']);
    expect(list[0].body).toBe('A merchant has arrived');
    const arrival = Date.parse('2026-10-09T15:50:36Z');
    expect(list[0].at.getTime()).toBeGreaterThanOrEqual(arrival - 1000 * 60);
    expect(list[0].at.getTime() - arrival).toBeLessThan(13 * 3600 * 1000);
  });

  it('covers half a year by default', () => {
    const list = moonNotificationSchedule(now);
    expect(list.length).toBeGreaterThanOrEqual(12);
    expect(list.some((n) => n.title === 'Conjunction')).toBe(true);
  });
});

function fakePlugin(display: string, granted = display) {
  return {
    checkPermissions: vi.fn().mockResolvedValue({ display }),
    requestPermissions: vi.fn().mockResolvedValue({ display: granted }),
    getPending: vi.fn().mockResolvedValue({ notifications: [{ id: 3 }, { id: 4 }] }),
    cancel: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue({ notifications: [] }),
  };
}
const now = new Date('2026-10-06T12:00:00Z');
type P = Parameters<typeof syncMoonNotifications>[0];

describe('syncMoonNotifications', () => {
  it('replaces whatever was pending with the new schedule', async () => {
    const p = fakePlugin('granted');
    await syncMoonNotifications(p as unknown as P, now);
    expect(p.requestPermissions).not.toHaveBeenCalled();
    expect(p.cancel).toHaveBeenCalledWith({ notifications: [{ id: 3 }, { id: 4 }] });
    const { notifications } = p.schedule.mock.calls[0][0];
    expect(notifications[0]).toMatchObject({ id: 1, title: 'New moon' });
    expect(notifications[0].schedule.at).toBeInstanceOf(Date);
  });

  it('asks the first time, and schedules once allowed', async () => {
    const p = fakePlugin('prompt', 'granted');
    await syncMoonNotifications(p as unknown as P, now);
    expect(p.requestPermissions).toHaveBeenCalled();
    expect(p.schedule).toHaveBeenCalled();
  });

  it('does nothing when the player says no', async () => {
    const p = fakePlugin('prompt', 'denied');
    await syncMoonNotifications(p as unknown as P, now);
    expect(p.getPending).not.toHaveBeenCalled();
    expect(p.schedule).not.toHaveBeenCalled();
  });

  it('cancels nothing when nothing is pending', async () => {
    const p = fakePlugin('granted');
    p.getPending.mockResolvedValue({ notifications: [] });
    await syncMoonNotifications(p as unknown as P, now);
    expect(p.cancel).not.toHaveBeenCalled();
  });
});
