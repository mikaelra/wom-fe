import LegacyLobbyRedirect from './LegacyLobbyRedirect';

// The old share-link shape (docs/MOBILE_AND_STEAM_PLAN.md §5.3) -- lobby
// links already handed out (copy-link, QR codes, chat history) point here,
// so this stays as a pure redirect to the new `/lobby?id=` shape rather than
// being deleted outright. generateStaticParams returning [] satisfies
// `output: "export"`'s requirement that every dynamic route be enumerable
// at build time; a native shell has no old links to preserve (nothing has
// ever shipped there), so this route simply doesn't exist in that bundle.
//
// generateStaticParams can only live in a Server Component (a 'use client'
// file can't export it), so the actual router.replace() logic is split into
// LegacyLobbyRedirect -- same split as /rules/[page]/page.tsx uses for its
// own generateStaticParams.
//
// `output: "export"` additionally requires at least one entry here (an
// empty array is a build error, not "no routes") -- this placeholder value
// is never linked to and never a real lobby id, so it's a harmless single
// static file in the native bundle rather than a real fallback path.
export function generateStaticParams() {
  return [{ lobbyId: "_static-export-placeholder" }];
}

export default async function LegacyLobbyRedirectPage({
  params,
}: {
  params: Promise<{ lobbyId: string }>;
}) {
  const { lobbyId } = await params;
  return <LegacyLobbyRedirect lobbyId={lobbyId} />;
}
