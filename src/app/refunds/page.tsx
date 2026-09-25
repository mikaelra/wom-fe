import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/config';
import { CITY_PATH } from '@/lib/cities';

export const metadata = { title: 'Refund Policy — World of Mythos' };

export default function RefundsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-wide">Refund Policy</h1>
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

        <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 space-y-4 text-sm text-white/80 leading-relaxed">
          <p>
            World of Mythos purchases are digital goods, delivered instantly to your account.
          </p>
          <p>
            <strong className="text-white">An unspun Special Wheel is refundable</strong>{' '}
            within 14 days of purchase, since nothing has been drawn yet.
          </p>
          <p>
            <strong className="text-white">A spun wheel is not refundable.</strong> Spinning
            it is treated as immediate performance of the purchase — the result is delivered
            the moment you spin, which is why we don&apos;t ask for confirmation again after
            that point.
          </p>
          <p>
            <strong className="text-white">Direct skin purchases</strong> (e.g. Cherub) are
            refundable within 14 days if the skin has not been equipped.
          </p>
          <p>
            To request a refund, email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-amber-300 underline hover:text-amber-200">
              {SUPPORT_EMAIL}
            </a>{' '}
            with your order number. Refunds are issued to the original payment method.
          </p>
        </div>
      </div>
    </div>
  );
}
