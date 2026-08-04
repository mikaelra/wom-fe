import Link from 'next/link';
import GuideStepPreview from '@/components/rules/GuideStepPreview';
import { GUIDE_STEPS } from '@/lib/guideSteps';

const PAGE_NUMBERS = GUIDE_STEPS.map((_, i) => `p${i + 1}`);

export function generateStaticParams() {
  return PAGE_NUMBERS.map((page) => ({ page }));
}

export default async function RulesWalkerPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const pageNum = parseInt(page?.replace('p', '') || '0', 10);
  const step = GUIDE_STEPS[pageNum - 1];
  const isFirst = pageNum === 1;
  const isLast = pageNum === GUIDE_STEPS.length;
  const prevPage = `p${pageNum - 1}`;
  const nextPage = `p${pageNum + 1}`;

  if (!step) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-8">
        <div className="bg-white/80 rounded-2xl shadow-xl p-8 text-center">
          <p className="text-lg text-gray-700 mb-4">That rules page doesn&apos;t exist.</p>
          <Link href="/rules" className="underline text-blue-600 text-xl">← Back to Rules</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-8">
      {/* Background Image */}
      <img
        src="/images/parchment.png"
        alt="Background"
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      />
      <div className="w-full max-w-2xl flex flex-col items-center gap-6 rounded-2xl shadow-xl bg-white/90 backdrop-blur-sm p-6 sm:p-10 transition-all duration-300">
        <span className="text-sm font-semibold text-gray-400">{pageNum} / {GUIDE_STEPS.length}</span>
        <p className="text-2xl sm:text-3xl text-center text-gray-800 font-medium leading-snug">
          {step.text}
        </p>
        {/* The real in-game buttons/cards this step describes -- not a
            screenshot, so it can't go stale the way a captured image would
            the next time these are restyled. There's no live round here for
            a step's highlighted elements to actually blink (unlike
            InGameGuide during a match), so altHighlights are folded in and
            shown statically alongside the primary highlights. */}
        <GuideStepPreview step={step} />

        <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
          {isFirst ? (
            <Link href="/rules" className="underline text-blue-600" style={{ fontSize: '1.5rem' }}>
              ← Back
            </Link>
          ) : (
            <Link href={`/rules/${prevPage}`} className="underline text-blue-600" style={{ fontSize: '1.5rem' }}>
              ← Previous
            </Link>
          )}
          <Link href="/" className="no-underline" style={{ fontSize: '1.5rem' }} aria-label="Back to Home">
            🏠
          </Link>
          {!isLast && (
            <Link href={`/rules/${nextPage}`} className="underline text-blue-600" style={{ fontSize: '1.5rem' }}>
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
