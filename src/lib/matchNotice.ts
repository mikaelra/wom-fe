// The phone notification when a ranked match the player is queued into has
// started (Mikael, 2026-10-17). A local notification, fired by the app itself
// the moment it sees the start -- so it only reaches a phone whose app is
// open or freshly in the background; push from the server (APNs) is for
// later. iOS only, like lib/moonNotifications.ts, whose permission prompt it
// shares.

import { LocalNotifications } from '@capacitor/local-notifications';
import { GAME_STARTED } from '@/lib/matchCloud';

/** Far from moonNotifications' 1..60, which every launch cancels and redraws. */
export const RANKED_STARTED_NOTIFICATION_ID = 900;

type Plugin = Pick<typeof LocalNotifications, 'checkPermissions' | 'schedule'>;

export async function notifyRankedStarted(plugin: Plugin = LocalNotifications, now = new Date()): Promise<void> {
  const { display } = await plugin.checkPermissions();
  if (display !== 'granted') return;
  await plugin.schedule({
    notifications: [
      {
        id: RANKED_STARTED_NOTIFICATION_ID,
        title: 'World of Mythos',
        body: GAME_STARTED,
        schedule: { at: new Date(now.getTime() + 100) },
      },
    ],
  });
}
