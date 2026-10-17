'use client';

import AccountWelcome from '@/components/account/AccountWelcome';
import { appleSignIn, createAppleAccount, startAppleLink } from '@/lib/appleAccount';

/** The iOS app's sign-in with the Apple account (src/lib/appleAccount.ts).
 *  Renders nothing outside the iOS app. Mounted once, in the root layout. */
export default function AppleWelcome() {
  return (
    <AccountWelcome
      signIn={() => appleSignIn()}
      create={(name) => createAppleAccount(name)}
      startLink={startAppleLink}
    />
  );
}
