'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createLobby, joinLobby, getRaidLobby, getNextRaidTime, getPlayerRelics } from '@/lib/api';
import type { Relic } from '@/types/game';
import type { City } from '@/lib/cities';

const buttonBase =
  'px-4 py-2 rounded-lg border-2 border-black font-bold cursor-pointer transition-colors';

interface HomeOverlayProps {
  /** If set, the overlay is shown as a City Hub for this city. */
  city?: City | null;
  /** Called when the player wants to return to the world map. */
  onBackToMap?: () => void;
}

export default function HomeOverlay({ city, onBackToMap }: HomeOverlayProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [secondsUntilNextRaid, setSecondsUntilNextRaid] = useState<number | null>(null);
  const [showRelics, setShowRelics] = useState(false);
  const [relics, setRelics] = useState<Relic[]>([]);

  const [loggedInName, setLoggedInName] = useState('');
  const [mounted, setMounted] = useState(false);
  const isLoggedIn = mounted && !!loggedInName;

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('playerName') || '';
      setName(stored);
      setLoggedInName(stored);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    getNextRaidTime()
      .then((json) => {
        if (cancelled) return;
        const nextRT = new Date(json.start_time);
        intervalId = setInterval(() => {
          const diff = Math.floor((nextRT.getTime() - Date.now()) / 1000);
          setSecondsUntilNextRaid(diff <= 0 ? 0 : diff);
        }, 1000);
      })
      .catch(() => {
        if (!cancelled) setSecondsUntilNextRaid(null);
      });
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [mounted]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') || '' : '';
    try {
      const data = await createLobby(name.trim(), email);
      if (typeof window !== 'undefined') localStorage.setItem('playerName', name.trim());
      router.push(`/lobby/${data.lobby_id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Create lobby failed');
    }
  };

  const handleJoin = async () => {
    if (!name.trim() || !joinCode.trim()) return;
    const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') || '' : '';
    try {
      await joinLobby(joinCode.trim(), name.trim(), email);
      if (typeof window !== 'undefined') localStorage.setItem('playerName', name.trim());
      router.push(`/lobby/${joinCode.trim()}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Join failed');
    }
  };

  const handleEnterRaid = async () => {
    const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!playerName) {
      alert('You must be logged in to enter the raid.');
      return;
    }
    try {
      const data = await getRaidLobby(playerName);
      router.push(`/lobby/${data.lobby_id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to enter raid.');
    }
  };

  const fetchRelics = async () => {
    const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!playerName) return;
    try {
      const data = await getPlayerRelics(playerName);
      setRelics(data.relics ?? []);
    } catch {
      setRelics([]);
    } finally {
      setShowRelics(true);
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('playerName');
      localStorage.removeItem('playerEmail');
      setLoggedInName('');
      window.location.reload();
    }
  };

  if (!mounted) return null;

  return (
    <>
      {/* Top-left: back button + auth + relics */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-20">
        {/* Back to map button */}
        {city && onBackToMap && (
          <button
            type="button"
            onClick={onBackToMap}
            className="flex items-center gap-2 bg-black/60 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:bg-black/80 transition-colors"
          >
            <span className="text-lg leading-none">&larr;</span> Back to Map
          </button>
        )}

        {!isLoggedIn && (
          <>
            <Link
              href="/login"
              className={`${buttonBase} bg-gray-200 text-black no-underline inline-block text-center`}
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className={`${buttonBase} bg-gray-200 text-black no-underline inline-block text-center`}
            >
              Create User
            </Link>
          </>
        )}
        {isLoggedIn && (
          <>
            <div
              className={`${buttonBase} bg-gray-200 text-black cursor-default text-center`}
            >
              Logged in as: {loggedInName}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className={`${buttonBase} bg-gray-200 text-black`}
            >
              Logout
            </button>
            <button
              type="button"
              onClick={fetchRelics}
              className={`${buttonBase} bg-gray-200 text-black`}
            >
              Your relics
            </button>
          </>
        )}
      </div>

      {/* Relics modal */}
      {showRelics && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowRelics(false)}
        >
          <div
            className="bg-white text-black p-6 rounded-xl shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold mb-4">Your relics</h3>
            <ul className="list-disc pl-6 mb-4">
              {relics.length > 0 ? (
                relics.map((relic) => (
                  <li key={String(relic.id)}>
                    <strong>{relic.name} x{relic.count}</strong>
                  </li>
                ))
              ) : (
                <p>You have no relics yet.</p>
              )}
            </ul>
            <button
              type="button"
              onClick={() => setShowRelics(false)}
              className={`${buttonBase} bg-gray-200 text-black`}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Center: main home content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
        <div className="pointer-events-auto flex flex-col items-center gap-4 text-white text-center">
          {/* City name banner when in a city hub */}
          {city && (
            <div className="mb-2">
              <h2
                className="text-3xl font-extrabold tracking-wide drop-shadow-lg"
                style={{ color: city.color }}
              >
                {city.name}
              </h2>
              <p className="text-sm text-white/60 mt-1">{city.tag} &mdash; {city.country}</p>
            </div>
          )}

          {secondsUntilNextRaid !== null && secondsUntilNextRaid > 0 && (
            <p className="font-bold text-lg drop-shadow-md">
              Next boss-fight in: {Math.floor(secondsUntilNextRaid / 60)}m {secondsUntilNextRaid % 60}s
            </p>
          )}

          {!isLoggedIn && (
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-64 p-2 rounded-l-md bg-gray-200 text-gray-800 border-2 border-black focus:outline-none"
            />
          )}

          <div className="flex items-center gap-2 flex-wrap justify-center">
            <input
              type="text"
              placeholder="Lobby code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              className="w-40 p-2 rounded-md bg-gray-200 text-gray-800 border-2 border-black focus:outline-none"
            />
            <button
              type="button"
              onClick={handleJoin}
              className={`${buttonBase} bg-gray-200 text-black`}
            >
              Join
            </button>
          </div>

          <button
            type="button"
            onClick={handleCreate}
            className={`${buttonBase} bg-gray-200 text-black`}
          >
            Create Lobby
          </button>

          <button
            type="button"
            onClick={handleEnterRaid}
            className="text-2xl bg-transparent border-none cursor-pointer underline mt-2"
            style={{ color: 'gold' }}
          >
            Enter Boss-fight
          </button>

          <div className="flex flex-col gap-2 mt-4">
            <Link href="/rules" className="text-xl underline" style={{ color: 'yellow' }}>
              Rules
            </Link>
            <Link href="/rules/p1" className="text-xl underline" style={{ color: 'lightgreen' }}>
              Rules For Nerds
            </Link>
            <Link href="/leaderboards" className="text-xl underline" style={{ color: 'red' }}>
              Leaderboards
            </Link>
            <Link href="/vault" className="text-xl underline" style={{ color: 'lightblue' }}>
              Do you have a key?
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
