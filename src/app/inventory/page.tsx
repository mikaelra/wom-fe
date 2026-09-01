'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getInventory, equipSkin, equipCosmetic, getPlayerRelics, getTradeUpRules } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { skinColor, skinLabel, skinThumbnailUrl, skinUrl } from '@/lib/frogSkins';
import { cosmeticDescription, cosmeticLabel } from '@/lib/cosmetics';
import { wheelKindLabel } from '@/lib/wheelGeometry';
import type { TradeUpRule, TradeUpResult } from '@/lib/tradeUps';
import WheelSpinModal from '@/components/WheelSpinModal';
import TradeUpModal from '@/components/TradeUpModal';
import RelicCoin from '@/components/RelicCoin';
import ArtifactLedgerModal from '@/components/ArtifactLedgerModal';
import ParchmentCard from '@/components/ParchmentCard';
import SpinningModelViewer from '@/components/SpinningModelViewer';
import { useToast } from '@/components/Toast';
import { useClaimVerificationPoll } from '@/lib/useClaimVerificationPoll';
import type { Relic } from '@/types/game';
import { CITY_PATH } from '@/lib/cities';

type SkinEntry = { skin: string; count: number };
type ArtifactEntry = { ordinal: number; discovered_at: string | null; cosmetic: string };
type WheelEntry = { id: number; kind: string };
// One button per distinct wheel kind, not one per row -- id is an arbitrary
// representative of the group (any wheel of that kind spins the same way).
type WheelGroup = { kind: string; id: number; count: number };

const DEFAULT_SKIN = 'frog_green_v1';

function groupWheels(wheels: WheelEntry[]): WheelGroup[] {
  const groups = new Map<string, WheelGroup>();
  for (const w of wheels) {
    const existing = groups.get(w.kind);
    if (existing) existing.count += 1;
    else groups.set(w.kind, { kind: w.kind, id: w.id, count: 1 });
  }
  return Array.from(groups.values());
}

export default function InventoryPage() {
  const { showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [equippedSkin, setEquippedSkin] = useState(DEFAULT_SKIN);
  const [skins, setSkins] = useState<SkinEntry[]>([]);
  const [wheels, setWheels] = useState<WheelEntry[]>([]);
  const [relics, setRelics] = useState<Relic[]>([]);
  const [equipping, setEquipping] = useState<string | null>(null);
  // The Artifacts category. `artifact` is null for almost every account --
  // that is the point of it, and the empty state carries the weight.
  const [equippedCosmetic, setEquippedCosmetic] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<ArtifactEntry | null>(null);
  const [equippingCosmetic, setEquippingCosmetic] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [spinningWheel, setSpinningWheel] = useState<{ id: number; kind: string } | null>(null);
  const [tradeUpRules, setTradeUpRules] = useState<Record<string, TradeUpRule>>({});
  const [tradingUp, setTradingUp] = useState<{ skin: string; owned: number; rule: TradeUpRule } | null>(null);
  // Set when we're logged out but localStorage remembers a name+email pair
  // (i.e. a claim was submitted from this browser) -- covers verifying that
  // claim's email link on a different device (a phone) than this one, which
  // otherwise never learns the claim went through and just says "log in".
  const [pendingClaim, setPendingClaim] = useState<{ name: string; email: string } | null>(null);

  const load = () => {
    const token = getStoredAccountToken();
    if (!token) {
      setLoading(false);
      const name = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
      const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') : null;
      if (name && email) {
        setPendingClaim({ name, email });
        setLoadError('');
      } else {
        setPendingClaim(null);
        setLoadError('You must be logged in to view your inventory.');
      }
      return;
    }
    setPendingClaim(null);
    setLoading(true);
    const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    Promise.all([
      getInventory(token),
      playerName ? getPlayerRelics(playerName) : Promise.resolve({ relics: [] }),
    ])
      .then(([inventoryData, relicsData]) => {
        setEquippedSkin(inventoryData.equipped_skin);
        setSkins(inventoryData.skins);
        setWheels(inventoryData.wheels);
        setEquippedCosmetic(inventoryData.equipped_cosmetic ?? null);
        setArtifact(inventoryData.artifact ?? null);
        setRelics(relicsData.relics);
        setLoadError('');
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : 'Failed to load inventory.');
      })
      .finally(() => setLoading(false));

    // Fetched separately from the Promise.all above: a failure here means
    // no Trade up buttons render (docs/TRADE_UP_PLAN.md §8.2), not a
    // blocked page -- the inventory itself has nothing to do with the
    // ladder table.
    getTradeUpRules()
      .then((data) => setTradeUpRules(data.rules))
      .catch(() => setTradeUpRules({}));
  };

  useEffect(() => {
    load();
  }, []);

  useClaimVerificationPoll(!!pendingClaim, pendingClaim?.name ?? '', pendingClaim?.email ?? '', () => {
    setPendingClaim(null);
    load();
  });

  const handleEquip = async (skin: string) => {
    const token = getStoredAccountToken();
    if (!token) return;
    setEquipping(skin);
    try {
      const data = await equipSkin(token, skin);
      setEquippedSkin(data.equipped_skin);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to equip skin.');
    } finally {
      setEquipping(null);
    }
  };

  // Equip, or unequip by sending "". Unequipping needs no ownership check
  // server-side, so the same handler covers both directions.
  const handleToggleCosmetic = async (cosmetic: string) => {
    const token = getStoredAccountToken();
    if (!token) return;
    const next = equippedCosmetic === cosmetic ? '' : cosmetic;
    setEquippingCosmetic(true);
    try {
      const data = await equipCosmetic(token, next);
      setEquippedCosmetic(data.equipped_cosmetic);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to equip cosmetic.');
    } finally {
      setEquippingCosmetic(false);
    }
  };

  // The wheel modal shows its own result splash once it visually lands --
  // a toast fired the instant the server responds (well before landing)
  // would spoil it, so this only refreshes the background inventory data.
  const handleSpun = () => {
    load();
  };

  // TradeUpModal shows its own result state -- this just refreshes the
  // background inventory counts (docs/TRADE_UP_PLAN.md §8.4) and, if the
  // trade consumed the player's last copy of an equipped skin, applies the
  // reset without waiting on the reload.
  const handleTraded = (result: TradeUpResult) => {
    load();
    if (result.equipped_skin) setEquippedSkin(result.equipped_skin);
  };

  // Green is always owned implicitly -- no skin_items row needed for it
  // (docs/MONETIZATION_PLAN.md §3.1).
  const ownedSkins: SkinEntry[] = [{ skin: DEFAULT_SKIN, count: 1 }, ...skins];
  const wheelGroups = groupWheels(wheels);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
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
          <h1 className="text-2xl font-bold tracking-wide">Inventory</h1>
        </div>

        {loading ? (
          <p className="text-white/70">Loading…</p>
        ) : pendingClaim ? (
          <div className="bg-black/40 border border-white/10 rounded-xl p-5">
            <p className="text-white/70 mb-3">
              Waiting for you to verify <strong>{pendingClaim.email}</strong> — check your inbox
              for the link. This updates automatically once you click it, even from another
              device.
            </p>
            <Link
              href="/login"
              className="bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold no-underline hover:bg-white/20 transition-colors"
            >
              Go to log in instead
            </Link>
          </div>
        ) : loadError ? (
          <div className="bg-black/40 border border-white/10 rounded-xl p-5">
            <p className="text-red-400 mb-3">{loadError}</p>
            <Link
              href="/login"
              className="bg-white/10 border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold no-underline hover:bg-white/20 transition-colors"
            >
              Go to log in
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Relics</h2>
              {relics.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {relics.map((relic) => (
                    <div
                      key={String(relic.id)}
                      className="flex flex-col items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-4"
                    >
                      <div className="w-16 h-16 overflow-hidden">
                        <RelicCoin />
                      </div>
                      <p className="text-sm font-semibold text-center">{relic.name}</p>
                      {relic.power_category === 'MONETARY' && (
                        <span className="text-[10px] uppercase tracking-wide text-amber-400/80 border border-amber-400/30 rounded px-1.5 py-0.5">
                          Consumable
                        </span>
                      )}
                      {relic.flavour_text && (
                        <p className="text-xs text-white/50 text-center">{relic.flavour_text}</p>
                      )}
                      {relic.count > 1 && <p className="text-xs text-white/50">×{relic.count}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/60 text-sm">You have no relics yet.</p>
              )}
            </div>

            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Wheels</h2>
                <Link
                  href="/shop"
                  className="text-xs text-amber-300 hover:text-amber-200 transition-colors no-underline"
                >
                  Shop →
                </Link>
              </div>
              {wheelGroups.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {wheelGroups.map((group) => (
                    <button
                      key={group.kind}
                      type="button"
                      onClick={() => setSpinningWheel({ id: group.id, kind: group.kind })}
                      className="px-4 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors cursor-pointer"
                    >
                      🎡 Use {wheelKindLabel(group.kind)}{group.count > 1 ? ` ×${group.count}` : ''}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-white/60 text-sm mb-3">You don&apos;t have any wheels yet.</p>
                  <Link
                    href="/shop"
                    className="inline-block px-4 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors no-underline text-sm"
                  >
                    Get a Special Wheel
                  </Link>
                </div>
              )}
            </div>

            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Skins</h2>
              <div className="w-40 h-40 mx-auto mb-6">
                <SpinningModelViewer key={equippedSkin} url={skinUrl(equippedSkin)} targetSize={1.8} spinSpeed={0.6} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {ownedSkins.map(({ skin, count }) => {
                  const isEquipped = skin === equippedSkin;
                  return (
                    <div
                      key={skin}
                      className="flex flex-col items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-4"
                    >
                      <div
                        className="w-16 h-16 rounded-full border-2 border-white/20 overflow-hidden"
                        style={{ background: skinColor(skin) }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- a small
                            fixed set of local static assets, not remote/user content */}
                        <img
                          src={skinThumbnailUrl(skin)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="text-sm font-semibold capitalize text-center">{skinLabel(skin)}</p>
                      {count > 1 && <p className="text-xs text-white/50">×{count}</p>}
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        {isEquipped ? (
                          <span className="text-xs font-bold text-green-400">EQUIPPED</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleEquip(skin)}
                            disabled={equipping === skin}
                            className="text-xs px-3 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {equipping === skin ? 'Equipping…' : 'Equip'}
                          </button>
                        )}
                        {tradeUpRules[skin] && (
                          <button
                            type="button"
                            onClick={() => setTradingUp({ skin, owned: count, rule: tradeUpRules[skin] })}
                            className="text-xs px-3 py-1 rounded-md bg-amber-700/80 text-amber-200 border border-amber-600 hover:bg-amber-600/80 transition-colors cursor-pointer"
                          >
                            Trade up
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Artifacts. Below Skins deliberately: it is the rarest thing a
                player can own and the last thing they scroll to, not a
                headline slot that is empty for almost everyone. */}
            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Artifacts</h2>
                <button
                  type="button"
                  onClick={() => setShowLedger(true)}
                  className="text-xs text-amber-300 hover:text-amber-200 transition-colors cursor-pointer bg-transparent border-0 p-0"
                >
                  Who has found one? →
                </button>
              </div>

              {artifact ? (
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <button
                    type="button"
                    onClick={() => setShowLedger(true)}
                    aria-label={`Artifact number ${artifact.ordinal}, open the discovery ledger`}
                    className="w-28 h-28 shrink-0 bg-transparent border-0 p-0 cursor-pointer"
                  >
                    <ParchmentCard />
                  </button>
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-sm font-semibold">
                      {cosmeticLabel(artifact.cosmetic)}
                      <span className="ml-2 text-amber-300 tabular-nums">#{artifact.ordinal}</span>
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      {cosmeticDescription(artifact.cosmetic)}
                    </p>
                    <div className="mt-3 flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                      {equippedCosmetic === artifact.cosmetic ? (
                        <>
                          <span className="text-xs font-bold text-green-400">EQUIPPED</span>
                          <button
                            type="button"
                            onClick={() => handleToggleCosmetic(artifact.cosmetic)}
                            disabled={equippingCosmetic}
                            className="text-xs px-3 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            {equippingCosmetic ? 'Working…' : 'Unequip'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleCosmetic(artifact.cosmetic)}
                          disabled={equippingCosmetic}
                          className="text-xs px-3 py-1 rounded-md bg-white/10 border border-white/20 hover:bg-white/20 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {equippingCosmetic ? 'Working…' : 'Equip'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-white/60 text-sm mb-1">You have not found an artifact.</p>
                  <p className="text-white/40 text-xs">
                    They turn up at The Well, and get easier to find every time
                    someone in the world discovers one.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showLedger && (
        <ArtifactLedgerModal
          highlightOrdinal={artifact?.ordinal ?? null}
          onClose={() => setShowLedger(false)}
        />
      )}

      {spinningWheel !== null && (
        <WheelSpinModal
          wheelId={spinningWheel.id}
          kind={spinningWheel.kind}
          onClose={() => setSpinningWheel(null)}
          onSpun={handleSpun}
          onEquipped={setEquippedSkin}
        />
      )}

      {tradingUp !== null && (
        <TradeUpModal
          skin={tradingUp.skin}
          owned={tradingUp.owned}
          rule={tradingUp.rule}
          onClose={() => setTradingUp(null)}
          onTraded={handleTraded}
          onEquipped={setEquippedSkin}
          onSpinNow={(wheelId) => setSpinningWheel({ id: wheelId, kind: 'special' })}
        />
      )}
    </div>
  );
}
