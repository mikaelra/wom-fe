import Link from 'next/link';
import { SUPPORT_EMAIL, LEGAL_ENTITY_NAME, LEGAL_ENTITY_ADDRESS } from '@/config';
import { CITY_PATH } from '@/lib/cities';

export const metadata = { title: 'Privacy Policy — World of Mythos' };

// Last substantive revision. Bump this in the same commit as any change to
// the text below -- GDPR Art. 12 expects players to be able to tell whether
// the policy they read is the one in force.
const LAST_UPDATED = '2 September 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-white font-semibold text-base">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-wide">Privacy Policy</h1>
          {/* Home, and beside it the city. Kept as one item so a justify-between parent cannot fling them apart. */}
          <span className="emoji-pair inline-flex items-center gap-2">
            <Link
              href="/"
              className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-lg font-semibold hover:bg-white/20 transition-colors no-underline"
              aria-label="Back to Home"
            >
              🌍
            </Link>
            <Link
              href={CITY_PATH}
              className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-lg font-semibold hover:bg-white/20 transition-colors no-underline"
              aria-label="Go to the city"
            >
              🏛️
            </Link>
          </span>
        </div>

        <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 space-y-6 text-sm text-white/80 leading-relaxed">
          <p className="text-white/50 text-xs">Last updated: {LAST_UPDATED}</p>

          <p>
            This policy explains what World of Mythos collects about you, why, who else
            sees it, and how to get it back or get it deleted. It covers the game at
            worldofmythos.net and any packaged build of the same game.
          </p>

          <Section title="Who is responsible">
            <p>
              {LEGAL_ENTITY_NAME} is the data controller for the information described
              here.
              {LEGAL_ENTITY_ADDRESS ? ` Postal address: ${LEGAL_ENTITY_ADDRESS}.` : ''} For
              anything in this policy — including access, export, and deletion requests —
              contact{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-300 underline hover:text-amber-200">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="What we collect">
            <p>
              <strong className="text-white">Account details.</strong> Your player name and
              your email address. Email is used to verify the account and to log you in;
              once an account has made a purchase, every login on a new device needs a
              one-time code sent to that address.
            </p>
            <p>
              <strong className="text-white">Session tokens.</strong> Random strings that
              keep you logged in and identify you to the game server. They are stored in
              your browser and are not shared with anyone.
            </p>
            <p>
              <strong className="text-white">Gameplay data.</strong> The record of what
              happened in your games — rounds played, kills, wins and losses, boss and PvP
              outcomes, artifacts found, and which items and skins your account owns.
            </p>
            <p>
              <strong className="text-white">Chat messages.</strong> Messages you send in a
              lobby are stored on our server so they can be delivered and shown in the
              game.
            </p>
            <p>
              <strong className="text-white">Purchase records.</strong> What you bought,
              when, for how much, and the reference number of the payment. We never receive
              or store your card number — see “Payments” below.
            </p>
            <p>
              <strong className="text-white">Technical data.</strong> When something breaks,
              an automatic error report is sent to our error-tracking provider. These reports
              are about the fault, not about you: our error tracking is not configured to
              attach your account details. A report can still incidentally contain technical
              information such as an IP address, browser version, or the page you were on.
            </p>
          </Section>

          <Section title="Why we're allowed to hold it">
            <p>
              <strong className="text-white">To run the game you asked for</strong>{' '}
              (performance of a contract). Your account, session, gameplay history, chat, and
              purchases all exist because they are what the game is.
            </p>
            <p>
              <strong className="text-white">Because the law requires it</strong> (legal
              obligation). Records of sales have to be kept for accounting and tax purposes.
            </p>
            <p>
              <strong className="text-white">To keep the game working and fair</strong>{' '}
              (legitimate interests). Error tracking, and investigating abuse or cheating.
            </p>
          </Section>

          <Section title="Who else sees it">
            <p>
              We do not sell your data, and we do not share it with advertisers. There are no
              advertising or analytics trackers in the game. We use a small number of service
              providers, each of which only receives what it needs to do its job:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-white">Hetzner</strong> — hosting. Our servers and
                database run in Germany, inside the EU.
              </li>
              <li>
                <strong className="text-white">Stripe</strong> — payments. You enter card
                details on Stripe&apos;s own hosted checkout page, so card numbers never reach
                us. Stripe returns only a result and a reference.
              </li>
              <li>
                <strong className="text-white">Resend</strong> — sending verification and
                login emails.
              </li>
              <li>
                <strong className="text-white">Sentry</strong> — automatic error reports.
              </li>
            </ul>
            <p>
              Some of these providers are based in, or process data in, the United States.
              Where that happens, the transfer relies on the European Commission&apos;s
              standard contractual clauses and/or the EU–US Data Privacy Framework.
            </p>
            <p>
              We may also disclose data where we are legally required to — for example in
              response to a valid order from a court or authority.
            </p>
          </Section>

          <Section title="How long we keep it">
            <p>
              <strong className="text-white">Account, gameplay, and chat data</strong> is kept
              for as long as your account exists, and is deleted or anonymised when you ask
              us to delete the account.
            </p>
            <p>
              <strong className="text-white">Purchase and payment records</strong> are kept
              for at least five years after the end of the financial year in which the
              purchase was made, because bookkeeping law requires it. This means deleting your
              account does not delete your order history — that part we are obliged to keep,
              and it is retained for accounting purposes only.
            </p>
            <p>
              <strong className="text-white">Error reports</strong> are kept for a limited
              period by our error-tracking provider and then automatically discarded.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              If you are in the EU or EEA, the GDPR gives you the right to get a copy of the
              data we hold about you, to have it corrected, to have it deleted, to receive it
              in a portable format, and to object to or restrict certain uses of it.
            </p>
            <p>
              To use any of these, email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-300 underline hover:text-amber-200">
                {SUPPORT_EMAIL}
              </a>{' '}
              from the address on your account, or from an account you are logged into. We
              will confirm it&apos;s really you before acting — otherwise anyone could ask for
              your data — and we respond within 30 days.
            </p>
            <p>
              You also have the right to complain to your national data protection authority
              if you think we have handled your data badly.
            </p>
          </Section>

          <Section title="Storage in your browser">
            <p>
              We do not use tracking or advertising cookies. The game stores a few things
              locally in your browser so it can work at all: your session tokens, your player
              name and email so you don&apos;t have to retype them, and your sound settings.
              Clearing your browser storage logs you out and resets those preferences.
            </p>
          </Section>

          <Section title="Children">
            <p>
              World of Mythos is not directed at young children, and you must be 18 or older
              (or have the consent of a parent or guardian) to make a purchase — see our{' '}
              <Link href="/terms" className="text-amber-300 underline hover:text-amber-200">
                Terms of Sale
              </Link>
              . If you believe a child has given us personal data, contact us and we will
              delete it.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Traffic to the game is encrypted in transit. Verification codes are stored
              hashed rather than in the clear, and access to the production database is
              limited. No system is perfectly secure, but if a breach affects your data and
              poses a real risk to you, we will tell you and the relevant authority as the
              GDPR requires.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              If this policy changes in a way that matters, we will update the date at the top
              and, for significant changes, tell you in the game or by email.
            </p>
          </Section>

          <p className="text-white/50 text-xs pt-2">
            See also our{' '}
            <Link href="/terms" className="text-amber-300 underline hover:text-amber-200">
              Terms of Sale
            </Link>{' '}
            and{' '}
            <Link href="/refunds" className="text-amber-300 underline hover:text-amber-200">
              Refund Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
