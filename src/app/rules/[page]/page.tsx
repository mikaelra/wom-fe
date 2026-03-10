import Link from 'next/link';

const PAGE_NUMBERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

export function generateStaticParams() {
  return PAGE_NUMBERS.map((page) => ({ page }));
}

export default async function RulesNerdsPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const pageNum = parseInt(page?.replace('p', '') || '0', 10);
  const isFirst = pageNum === 1;
  const isLast = pageNum === 8;
  const prevPage = `p${pageNum - 1}`;
  const nextPage = `p${pageNum + 1}`;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 p-4 sm:p-8">
      {/* Background Image */}
      <img
        src="/images/parchment.png"
        alt="Background"
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      />
      <div className="w-full max-w-3xl flex flex-col items-center rounded-2xl shadow-xl bg-white/80 backdrop-blur-sm transition-all duration-300">
        <img
          src={`/images/rules/rules${page}.svg`}
          alt="Tjuvpakk Rules"
          style={{ maxWidth: "800px", width: "100%", margin: "0 auto", display: "block" }}
        />
        <div className="mt-4">
          {isFirst ? (
            <Link href="/" className="underline text-blue-600" style={{ fontSize: "2rem", marginRight: "20px" }}>
              ← Back to Home 🏠
            </Link>
          ) : (
            <Link href={`/rules/${prevPage}`} className="underline text-blue-600" style={{ fontSize: "2rem", marginRight: "20px" }}>
              ← Previous page
            </Link>
          )}
          {!isFirst && (
            <Link href="/" className="underline text-blue-600" style={{ fontSize: "2rem", marginRight: "20px" }}>
              🏠
            </Link>
          )}
          {!isLast && (
            <Link href={`/rules/${nextPage}`} className="underline text-blue-600" style={{ fontSize: "2rem" }}>
              Next page →
            </Link>
          )}
          {isLast && (
            <Link href="/" className="underline text-blue-600" style={{ fontSize: "2rem" }}>
              Home 🏠
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
