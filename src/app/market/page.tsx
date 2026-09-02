'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  acceptMarketListing,
  cancelMarketListing,
  createMarketListing,
  enterMarket,
  getInventory,
  getMarketCatalog,
  getPlayerRelics,
} from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { CITY_PATH } from '@/lib/cities';
import { skinLabel } from '@/lib/frogSkins';
import { wheelKindLabel } from '@/lib/wheelGeometry';
import { useToast } from '@/components/Toast';
import { useMarketConnection } from '@/lib/useMarketConnection';
import { itemKey, type MarketCatalog, type MarketItemInput, type MarketListing } from '@/lib/market';
import MarketBoard from '@/components/market/MarketBoard';
import MarketChatPanel from '@/components/market/MarketChatPanel';
import CraftOfferModal, { type OwnedItem } from '@/components/market/CraftOfferModal';
import ConfirmModal from '@/components/market/ConfirmModal';
import RmtDisclaimerBanner from '@/components/market/RmtDisclaimerBanner';
import RmtDisclaimerGateModal from '@/components/market/RmtDisclaimerGateModal';

/**
 * The Market -- a player-to-player trading post (wom-be docs/MARKET_PLAN.md,
 * direct-swap model §1A).
 *
 * A 2D DOM screen, not an R3F scene (§8.1): the board + chat + craft form
 * is UI-dense and a 3D treatment would only get in the way. Reached from
 * the city's signpost MARKET arm / Market building.
 */

type EnterData = {
  playerId: number;
  termsAccepted: boolean;
  coins: number;
  emailVerified: boolean;
};

type PendingAction =
  | { type: 'craft'; kind: 'quick' | 'long' }
  | { type: 'accept'; listing: MarketListing };

export default function MarketPage() {
  const toast = useToast();
  const { listings, chat, clockOffsetMs, refetch, sendChat } = useMarketConnection();

  const [token] = useState<string | null>(() => getStoredAccountToken());
  const [playerName] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('playerName') ?? '' : '',
  );

  const [catalog, setCatalog] = useState<MarketCatalog | null>(null);
  const [enterData, setEnterData] = useState<EnterData | null>(null);
  const [owned, setOwned] = useState<OwnedItem[]>([]);
  const [ownedCounts, setOwnedCounts] = useState<Record<string, number>>({});

  const [gate, setGate] = useState<PendingAction | null>(null);
  const [craft, setCraft] = useState<{ kind: 'quick' | 'long' } | null>(null);
  const [acceptTarget, setAcceptTarget] = useState<MarketListing | null>(null);

  // --- data loads --------------------------------------------------------

  useEffect(() => {
    getMarketCatalog().then(setCatalog).catch(() => toast.showError('Failed to load the market catalog.'));
  }, [toast]);

  const reloadPlayer = useCallback(async () => {
    if (!token) return;
    try {
      const [entered, inv, rel] = await Promise.all([
        enterMarket(token),
        getInventory(token).catch(() => null),
        playerName ? getPlayerRelics(playerName).catch(() => ({ relics: [] })) : Promise.resolve({ relics: [] }),
      ]);
      setEnterData({
        playerId: entered.player_id,
        termsAccepted: entered.terms_accepted,
        coins: entered.coins,
        emailVerified: entered.email_verified,
      });

      const list: OwnedItem[] = [];
      const counts: Record<string, number> = {};
      if (inv) {
        for (const s of inv.skins) {
          const input: MarketItemInput = { item_type: 'skin', skin: s.skin, quantity: 1 };
          list.push({ input, label: cap(skinLabel(s.skin)), count: s.count });
          counts[itemKey(input)] = s.count;
        }
        const wheelCounts = new Map<string, number>();
        for (const w of inv.wheels) wheelCounts.set(w.kind, (wheelCounts.get(w.kind) ?? 0) + 1);
        for (const [kind, count] of wheelCounts) {
          const input: MarketItemInput = { item_type: 'wheel', wheel_kind: kind, quantity: 1 };
          list.push({ input, label: wheelKindLabel(kind), count });
          counts[itemKey(input)] = count;
        }
      }
      for (const r of rel.relics) {
        const relicId = typeof r.id === 'string' ? Number(r.id) : r.id;
        if (!Number.isFinite(relicId) || r.count <= 0) continue;
        const input: MarketItemInput = { item_type: 'relic', relic_id: relicId, quantity: 1 };
        list.push({ input, label: r.name, count: r.count });
        counts[itemKey(input)] = r.count;
      }
      setOwned(list);
      setOwnedCounts(counts);
    } catch {
      toast.showError('Failed to load your market profile.');
    }
  }, [token, playerName, toast]);

  useEffect(() => {
    void reloadPlayer();
  }, [reloadPlayer]);

  // --- derived ----------------------------------------------------------

  const myPlayerId = enterData?.playerId ?? null;
  const canChat = !!token && !!enterData?.emailVerified;

  const canAccept = useCallback(
    (listing: MarketListing) => {
      if (!token || !enterData?.emailVerified) return false;
      if (myPlayerId != null && listing.seller_player_id === myPlayerId) return false;
      return listing.want.every((it) => (ownedCounts[itemKey(it)] ?? 0) >= it.quantity);
    },
    [token, enterData, myPlayerId, ownedCounts],
  );

  // --- gated action flow ----------------------------------------------

  const runAction = useCallback((action: PendingAction) => {
    if (action.type === 'craft') setCraft({ kind: action.kind });
    else setAcceptTarget(action.listing);
  }, []);

  const beginAction = useCallback(
    (action: PendingAction) => {
      if (!token) {
        toast.showError('Sign in to trade.');
        return;
      }
      if (!enterData?.emailVerified) {
        toast.showError('Verify your email to trade.');
        return;
      }
      if (!enterData.termsAccepted) {
        setGate(action);
        return;
      }
      runAction(action);
    },
    [token, enterData, toast, runAction],
  );

  const onGateAccepted = useCallback(() => {
    setEnterData((d) => (d ? { ...d, termsAccepted: true } : d));
    const pending = gate;
    setGate(null);
    if (pending) runAction(pending);
  }, [gate, runAction]);

  // --- mutations ------------------------------------------------------

  const submitCraft = useCallback(
    async (payload: { kind: 'quick' | 'long'; coins: number; give: MarketItemInput[]; want: MarketItemInput[] }) => {
      if (!token) return;
      await createMarketListing(token, payload);
      setCraft(null);
      toast.showSuccess('Trade posted.');
      refetch();
      void reloadPlayer();
    },
    [token, toast, refetch, reloadPlayer],
  );

  const confirmAccept = useCallback(async () => {
    if (!token || !acceptTarget) return;
    await acceptMarketListing(token, acceptTarget.id);
    setAcceptTarget(null);
    toast.showSuccess('Trade complete — check your inventory.');
    refetch();
    void reloadPlayer();
  }, [token, acceptTarget, toast, refetch, reloadPlayer]);

  const onCancel = useCallback(
    async (listing: MarketListing) => {
      if (!token) return;
      try {
        await cancelMarketListing(token, listing.id);
        toast.showSuccess('Trade cancelled.');
        refetch();
      } catch (e) {
        toast.showError(e instanceof Error ? e.message : 'Failed to cancel.');
      }
    },
    [token, toast, refetch],
  );

  const coinsAvailable = enterData?.coins ?? 0;

  const acceptSummary = useMemo(() => {
    if (!acceptTarget) return null;
    const fmt = (items: MarketListing['give']) =>
      items.map((i) => `${labelFor(i, catalog)}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ');
    return { give: fmt(acceptTarget.give), want: fmt(acceptTarget.want) };
  }, [acceptTarget, catalog]);

  return (
    <div className="min-h-screen w-full bg-[#0a0f1a] text-white flex flex-col">
      <RmtDisclaimerBanner text={catalog?.terms_text} />

      <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 text-sm">
        {/* Home + city, the same emoji pair the inventory/shop/stats headers
            use. Kept as one inline group so justify-between can't split them. */}
        <span className="inline-flex items-center gap-2">
          <Link
            href="/"
            aria-label="Back to Home"
            className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-lg font-semibold hover:bg-white/20 transition-colors no-underline"
          >
            🌍
          </Link>
          <Link
            href={CITY_PATH}
            aria-label="Go to the city"
            className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-lg font-semibold hover:bg-white/20 transition-colors no-underline"
          >
            🏛️
          </Link>
        </span>
        <div className="flex items-center gap-3">
          {token && (
            <span className="text-white/60 text-xs">
              🪙 {coinsAvailable} Hades&apos; Coin{coinsAvailable === 1 ? '' : 's'}
            </span>
          )}
          {token && (
            <Link
              href="/inventory"
              className="px-3 py-1.5 rounded-lg border border-white/20 text-sm no-underline hover:bg-white/10 transition-colors"
            >
              Inventory
            </Link>
          )}
          <h1 className="text-lg font-semibold">Market</h1>
        </div>
      </header>

      {!token && (
        <div className="mx-4 mt-3 rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/70">
          You&apos;re browsing as a guest.{' '}
          <Link href="/login" className="text-emerald-400 underline">
            Sign in
          </Link>{' '}
          to post trades and chat.
        </div>
      )}
      {token && enterData && !enterData.emailVerified && (
        <div className="mx-4 mt-3 rounded-lg bg-amber-950/50 border border-amber-500/30 px-4 py-2 text-sm text-amber-100">
          Verify your email to post or accept trades.
        </div>
      )}

      <main className="flex-1 grid lg:grid-cols-[1fr_340px] gap-4 p-4 min-h-0">
        <section className="min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => beginAction({ type: 'craft', kind: 'quick' })}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition-colors cursor-pointer"
            >
              /offer — quick (60s, free)
            </button>
            <button
              type="button"
              onClick={() => beginAction({ type: 'craft', kind: 'long' })}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-sm font-semibold transition-colors cursor-pointer"
            >
              /longoffer — 6–24h (🪙)
            </button>
          </div>
          <MarketBoard
            listings={listings}
            catalog={catalog}
            clockOffsetMs={clockOffsetMs}
            myPlayerId={myPlayerId}
            canAccept={canAccept}
            onAccept={(l) => beginAction({ type: 'accept', listing: l })}
            onCancel={onCancel}
          />
        </section>

        <aside className="min-h-[300px] lg:h-[calc(100vh-9rem)]">
          <MarketChatPanel
            messages={chat}
            canChat={canChat}
            onSend={sendChat}
            onSlashCommand={(kind) => beginAction({ type: 'craft', kind })}
          />
        </aside>
      </main>

      {gate && (
        <RmtDisclaimerGateModal onAccepted={onGateAccepted} onClose={() => setGate(null)} />
      )}

      {craft && catalog && (
        <CraftOfferModal
          kind={craft.kind}
          catalog={catalog}
          owned={owned}
          coinsAvailable={coinsAvailable}
          onSubmit={submitCraft}
          onClose={() => setCraft(null)}
        />
      )}

      {acceptTarget && acceptSummary && (
        <ConfirmModal
          title="Accept this trade?"
          confirmLabel="Accept trade"
          onConfirm={confirmAccept}
          onClose={() => setAcceptTarget(null)}
        >
          <p>
            You give <span className="text-white">{acceptSummary.want}</span>.
          </p>
          <p>
            You receive <span className="text-white">{acceptSummary.give}</span>.
          </p>
          <p className="text-white/50">Ownership is re-checked as the swap runs. This can&apos;t be undone.</p>
        </ConfirmModal>
      )}
    </div>
  );
}

function cap(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function labelFor(
  item: { item_type: string; skin: string | null; relic_id: number | null; wheel_kind: string | null },
  catalog: MarketCatalog | null,
): string {
  if (item.item_type === 'skin') return cap(skinLabel(item.skin ?? ''));
  if (item.item_type === 'wheel') return wheelKindLabel(item.wheel_kind ?? '');
  return catalog?.relics.find((r) => r.id === item.relic_id)?.name ?? `Relic #${item.relic_id}`;
}
