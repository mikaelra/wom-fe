// The iOS app's notifications: one when a merchant arrives -- John Dee at a
// full or new moon, Hildegard von Bingen at a conjunction. Local
// notifications, worked out and scheduled on the device from skyCalendar.ts
// (no push server, no device tokens). Every launch replaces the whole
// schedule, so it stays right after an app update changes the rules, and
// the next half year is always covered for a player who opens the app now
// and then. <MoonNotifications> in the root layout runs it, on iOS only.

import { LocalNotifications } from '@capacitor/local-notifications';
import { MERCHANT_WINDOW_MS, skyEventsBetween } from '@/lib/skyCalendar';

/** How far ahead notifications are scheduled -- about six of each moon and
 *  a handful of conjunctions, well under iOS's 64 pending. */
export const HORIZON_DAYS = 180;
const MAX_PENDING = 60;

// Not at night: an arrival before EARLIEST_HOUR or from LATEST_HOUR (the
// device's local time) is announced at EARLIEST_HOUR instead. A merchant
// stays 48 hours, so he is still there then.
const EARLIEST_HOUR = 9;
const LATEST_HOUR = 21;

// The user's wording, the same for every merchant.
const TEXT = { title: 'World of Mythos', body: 'A merchant has arrived' };

export interface MoonNotification {
  title: string;
  body: string;
  at: Date;
}

/** Moved out of the night, in the device's local time. */
export function daytime(at: Date): Date {
  const d = new Date(at);
  const hour = at.getHours();
  if (hour >= LATEST_HOUR) d.setDate(d.getDate() + 1);
  if (hour < EARLIEST_HOUR || hour >= LATEST_HOUR) d.setHours(EARLIEST_HOUR, 0, 0, 0);
  return d;
}

/** The notifications from `now` on: one per merchant whose arrival is
 *  still ahead (a merchant already here isn't announced). */
export function moonNotificationSchedule(now: Date, days = HORIZON_DAYS): MoonNotification[] {
  const end = new Date(now.getTime() + days * 86400 * 1000);
  return skyEventsBetween(now, end)
    .map((e) => ({ ...TEXT, arrival: new Date(e.at.getTime() - MERCHANT_WINDOW_MS) }))
    .filter((n) => n.arrival > now)
    .slice(0, MAX_PENDING)
    .map(({ title, body, arrival }) => ({ title, body, at: daytime(arrival) }));
}

type Plugin = Pick<typeof LocalNotifications, 'checkPermissions' | 'requestPermissions' | 'getPending' | 'cancel' | 'schedule'>;

/** Asks once (iOS remembers the answer, and Settings changes it), then
 *  replaces every pending notification with the schedule from `now`. */
export async function syncMoonNotifications(plugin: Plugin = LocalNotifications, now = new Date()): Promise<void> {
  let { display } = await plugin.checkPermissions();
  if (display === 'prompt' || display === 'prompt-with-rationale') ({ display } = await plugin.requestPermissions());
  if (display !== 'granted') return;
  const { notifications: pending } = await plugin.getPending();
  if (pending.length) await plugin.cancel({ notifications: pending.map((n) => ({ id: n.id })) });
  const schedule = moonNotificationSchedule(now);
  if (!schedule.length) return;
  await plugin.schedule({
    notifications: schedule.map((n, i) => ({ id: i + 1, title: n.title, body: n.body, schedule: { at: n.at } })),
  });
}
