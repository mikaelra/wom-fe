'use client';

import Link from 'next/link';

export default function ShopCancelPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center justify-center text-center">
      <div className="w-full max-w-sm bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6">
        <p className="text-3xl mb-3">🛒</p>
        <p className="text-white/70 mb-5">No charge was made.</p>
        <Link
          href="/shop"
          className="inline-block px-5 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-bold hover:bg-amber-600/80 transition-colors no-underline"
        >
          Back to Shop
        </Link>
      </div>
    </div>
  );
}
