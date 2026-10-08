import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/config';
import { CITY_PATH } from '@/lib/cities';

export const metadata = { title: 'Support — World of Mythos' };

// The App Store's Support URL. Apple also expects a game where players can
// talk to each other to publish a way to contact the developer.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-white font-semibold text-base">{title}</h2>
      {children}
    </section>
  );
}

const linkClass = 'text-amber-300 underline hover:text-amber-200';

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-wide">Support</h1>
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
          <Section title="Contact">
            <p>
              For help with the game, your account or a purchase, email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <Section title="Reporting a player">
            <p>
              Tap a player&apos;s message in the chat and choose Report, or Mute to stop
              seeing their messages. Muted players can be unmuted from{' '}
              <Link href="/settings" className={linkClass}>
                Settings
              </Link>
              .
            </p>
          </Section>

          <Section title="Deleting your account">
            <p>
              Go to{' '}
              <Link href="/settings" className={linkClass}>
                Settings
              </Link>{' '}
              and choose Delete account.
            </p>
          </Section>

          <p className="text-white/50 text-xs pt-2">
            See also our{' '}
            <Link href="/privacy" className={linkClass}>
              Privacy Policy
            </Link>
            ,{' '}
            <Link href="/terms" className={linkClass}>
              Terms of Sale
            </Link>{' '}
            and{' '}
            <Link href="/refunds" className={linkClass}>
              Refund Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
