'use client';

import AccountWelcome from '@/components/account/AccountWelcome';
import { createSteamAccount, startSteamLink, steamSignIn } from '@/lib/steamAccount';

/** The Steam build's sign-in (src/lib/steamAccount.ts), suggesting the
 *  Steam account's name for a new account. Renders nothing outside the
 *  Steam client. Mounted once, in the root layout. */
export default function SteamWelcome() {
  return (
    <AccountWelcome
      signIn={async () => {
        const r = await steamSignIn();
        return r.status === 'new' ? { status: 'new', suggestedName: r.steamName } : r;
      }}
      create={(name) => createSteamAccount(name)}
      startLink={startSteamLink}
    />
  );
}
