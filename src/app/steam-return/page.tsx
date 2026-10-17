'use client';

import { useEffect } from 'react';

// Where Steam sends the player after they approve a web purchase (the Linux
// build, which has no Steam overlay: wom-be routes/shop_steam.py
// _with_return_url). The game has already granted the item by then
// (lib/steamShop.ts polls) and raises its own window, so this page only says
// so and closes itself where the browser lets it. Text: Mikael, 2026-10-11.

export default function SteamReturnPage() {
  useEffect(() => {
    window.close();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-white p-6 flex items-center justify-center">
      <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl p-6 max-w-xl text-center">
        <p className="text-green-400 font-semibold">Purchase approved. Your item(s) is in your inventory.</p>
      </div>
    </div>
  );
}
