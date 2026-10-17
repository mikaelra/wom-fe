'use client';

import { useState } from 'react';

/**
 * The persistent RMT disclaimer banner (wom-be docs/MARKET_PLAN.md §1.1a).
 *
 * Shows the exact required wording the whole time a player is in `/market`.
 * The visual banner is dismissable *for the session only* -- it reappears
 * on the next visit. It is not a gate on its own; the one-time "I
 * understand" gate (RmtDisclaimerGateModal) is what actually blocks a
 * first post/accept, and its acceptance is recorded server-side.
 */

export const RMT_DISCLAIMER_TEXT =
  'No real money are allowed to be exchanged as part of an in-game trade. ' +
  'If WoM gets proof of such a trade taken place, you will lose your account.';

const SESSION_KEY = 'wom_market_banner_dismissed';

export default function RmtDisclaimerBanner({ text = RMT_DISCLAIMER_TEXT }: { text?: string }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  return (
    <div className="w-full bg-amber-950/80 border-b border-amber-500/40 text-amber-100 text-xs sm:text-sm px-4 py-2 flex items-start gap-3">
      <span aria-hidden className="mt-0.5">⚠️</span>
      <p className="flex-1 leading-snug">{text}</p>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            window.sessionStorage.setItem(SESSION_KEY, '1');
          } catch {
            /* private mode -- the banner just won't remember, which is fine */
          }
        }}
        className="shrink-0 text-amber-300/80 hover:text-amber-100 transition-colors cursor-pointer text-lg leading-none"
        aria-label="Dismiss for this session"
      >
        ×
      </button>
    </div>
  );
}
