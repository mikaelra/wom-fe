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
      <div className="w-full max-w-3xl flex flex-col items-center rounded-2xl shadow-xl bg-white/80 backdrop-blur-sm transition-all duration-300">
        <img
          src="/images/rules.svg"
          alt="Tjuvpakk Rules"
          style={{ maxWidth: "800px", width: "100%", margin: "0 auto", display: "block" }}
        />
        <div className="mt-4">
          <Link href="/" className="underline text-blue-600" style={{ fontSize: "2rem" }}>
            ← Back to Home 🏠
          </Link>
        </div>
      </div>
    </div>
  );
}
