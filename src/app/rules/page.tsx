import Link from 'next/link';

export default function RulesPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-8">
      {/* Background Image */}
      <img
        src="/images/wizard.png"
        alt="Background"
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      />
      <div className="w-full max-w-2xl flex flex-col items-center gap-6 rounded-2xl shadow-xl bg-white/80 backdrop-blur-sm p-8 sm:p-12 text-center transition-all duration-300">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-800">Rules</h1>
        <p className="text-lg text-gray-600">
          A quick walk through how to play World of Mythos, with the real buttons and cards you&apos;ll actually see in a match.
        </p>
        <div className="mt-2 flex gap-6">
          <Link href="/" className="no-underline" style={{ fontSize: '2rem' }} aria-label="Back to Home">
            🌍
          </Link>
          <Link href="/rules/p1" className="underline text-blue-600" style={{ fontSize: '2rem' }}>
            Start →
          </Link>
        </div>
      </div>
    </div>
  );
}
