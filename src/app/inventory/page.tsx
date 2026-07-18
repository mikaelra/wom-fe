'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getInventory, equipSkin } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { skinColor, skinLabel } from '@/lib/frogSkins';
import WheelSpinModal from '@/components/WheelSpinModal';
import { useToast } from '@/components/Toast';

type SkinEntry = { skin: string; count: number };
type WheelEntry = { id: number; kind: string };

const DEFAULT_SKIN = 'frog_green_v1';

export default function InventoryPage() {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [equippedSkin, setEquippedSkin] = useState(DEFAULT_SKIN);
  const [skins, setSkins] = useState<SkinEntry[]>([]);
  const [wheels, setWheels] = useState<WheelEntry[]>([]);
  const [equipping, setEquipping] = useState<string | null>(null);
  const [spinningWheelId, setSpinningWheelId] = useState<number | null>(null);

  const load = () => {
    const token = getStoredAccountToken();
    if (!token) {
      setLoading(false);
      setLoadError('You must be logged in to view your inventory.');
      return;
    }
    setLoading(true);
    getInventory(token)
      .then((data) => {
        setEquippedSkin(data.equipped_skin);
        setSkins(data.skins);
        setWheels(data.wheels);
        setLoadError('');
      })
      .catch((e: unknown) => {
        setLoadError(e instanceof Error ? e.message : 'Failed to load inventory.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

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

  const handleSpun = (resultSkin: string) => {
    showSuccess(`You got: ${skinLabel(resultSkin)}!`);
    load();
  };

  // Green is always owned implicitly -- no skin_items row needed for it
  // (docs/MONETIZATION_PLAN.md §3.1).
  const ownedSkins: SkinEntry[] = [{ skin: DEFAULT_SKIN, count: 1 }, ...skins];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-wide">Inventory</h1>
          <Link
            href="/"
            className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-white/20 transition-colors no-underline"
          >
            ← Back to Home
          </Link>
        </div>

        {loading ? (
          <p className="text-white/70">Loading…</p>
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
            {wheels.length > 0 && (
              <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-6">
                <h2 className="text-lg font-semibold mb-4">Wheels</h2>
                <div className="flex flex-wrap gap-3">
                  {wheels.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setSpinningWheelId(w.id)}
                      className="px-4 py-2 rounded-lg bg-amber-700/80 text-amber-200 border border-amber-600 font-semibold hover:bg-amber-600/80 transition-colors cursor-pointer"
                    >
                      🎡 Use {w.kind} Wheel
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Skins</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {ownedSkins.map(({ skin, count }) => {
                  const isEquipped = skin === equippedSkin;
                  return (
                    <div
                      key={skin}
                      className="flex flex-col items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-4"
                    >
                      <div
                        className="w-16 h-16 rounded-full border-2 border-white/20"
                        style={{ background: skinColor(skin) }}
                      />
                      <p className="text-sm font-semibold capitalize text-center">{skinLabel(skin)}</p>
                      {count > 1 && <p className="text-xs text-white/50">×{count}</p>}
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
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {spinningWheelId !== null && (
        <WheelSpinModal
          wheelId={spinningWheelId}
          onClose={() => setSpinningWheelId(null)}
          onSpun={handleSpun}
        />
      )}
    </div>
  );
}
