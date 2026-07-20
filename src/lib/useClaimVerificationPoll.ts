import { useEffect, useRef } from 'react';
import { checkClaimVerified } from '@/lib/api';

const POLL_INTERVAL_MS = 4000;

// Polls /check_claim_verified while `active` is true -- covers the
// cross-device case where the verification link is opened on a different
// device (e.g. a phone) than the one waiting here (e.g. a PC), which never
// sees the session /confirm_email_verification issues on the device that
// actually clicked the link. checkClaimVerified stores the session token as
// a side effect (see lib/api.ts) once it reports verified: true; this just
// stops polling and lets the caller react.
export function useClaimVerificationPoll(
  active: boolean,
  name: string,
  email: string,
  onVerified: () => void,
) {
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  useEffect(() => {
    if (!active || !name || !email) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const { verified } = await checkClaimVerified(name, email);
        if (!cancelled && verified) onVerifiedRef.current();
      } catch {
        // Transient network hiccup -- just try again next interval.
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, name, email]);
}
