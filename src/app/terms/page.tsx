import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/config';

export const metadata = { title: 'Terms — World of Mythos' };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-wide">Terms of Sale</h1>
          <Link
            href="/"
            className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-lg font-semibold hover:bg-white/20 transition-colors no-underline"
            aria-label="Back to Home"
          >
            🌍
          </Link>
        </div>

        <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 space-y-4 text-sm text-white/80 leading-relaxed">
          <p>
            These terms apply to purchases made in the World of Mythos shop — the Special
            Wheel and any direct skin purchase (e.g. Cherub).
          </p>
          <p>
            <strong className="text-white">Age.</strong> You must be 18 or older, or have
            the consent of a parent or guardian, to make a purchase.
          </p>
          <p>
            <strong className="text-white">Account.</strong> Purchases require a verified
            email address on your account. Once an account has made a purchase, login
            requires a one-time email code on every device from then on.
          </p>
          <p>
            <strong className="text-white">The Special Wheel.</strong> Every spin is an
            independent random draw at the odds shown on the shop page and in the spin
            screen itself — there is no pity mechanic, no near-miss, and no way to
            influence the result. The odds shown are generated from the exact same
            configuration the draw uses.
          </p>
          <p>
            <strong className="text-white">No cash-out.</strong> Skins won or purchased are
            cosmetic only. They can never be exchanged for real money, sold, or traded on
            our platform.
          </p>
          <p>
            <strong className="text-white">Refunds.</strong> See our{' '}
            <Link href="/refunds" className="text-amber-300 underline hover:text-amber-200">
              Refund Policy
            </Link>
            .
          </p>
          <p>
            <strong className="text-white">Region.</strong> The Special Wheel is not
            available for purchase from Belgium or the Netherlands.
          </p>
          <p className="text-white/50 text-xs pt-2">
            Questions about a purchase? Contact{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-300 underline hover:text-amber-200">
              {SUPPORT_EMAIL}
            </a>{' '}
            and reference your order number.
          </p>
        </div>
      </div>
    </div>
  );
}
