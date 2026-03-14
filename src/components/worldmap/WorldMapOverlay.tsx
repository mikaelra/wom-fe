'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createLobby, joinLobby, getPlayerRelics } from '@/lib/api';
import type { Relic } from '@/types/game';

export default function WorldMapOverlay() {
  const router = useRouter();
  const [loggedInName, setLoggedInName] = useState('');
  const [mounted, setMounted] = useState(false);

  const [joinCode, setJoinCode] = useState('');
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [showNamePopup, setShowNamePopup] = useState(false);
  const [pendingAction, setPendingAction] = useState<'join' | 'create' | null>(null);
  const [popupName, setPopupName] = useState('');
  const [popupError, setPopupError] = useState('');

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showRelics, setShowRelics] = useState(false);
  const [relics, setRelics] = useState<Relic[]>([]);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setLoggedInName(localStorage.getItem('playerName') || '');
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('playerName');
      localStorage.removeItem('playerEmail');
      setLoggedInName('');
      setShowUserMenu(false);
      window.location.reload();
    }
  };

  const fetchRelics = async () => {
    const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!playerName) return;
    setShowUserMenu(false);
    try {
      const data = await getPlayerRelics(playerName);
      setRelics(data.relics ?? []);
    } catch {
      setRelics([]);
    } finally {
      setShowRelics(true);
    }
  };

  if (!mounted) return null;

  const isLoggedIn = !!loggedInName;

  const doJoin = async (name: string) => {
    const code = joinCode.trim();
    if (!code) return;
    const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') || '' : '';
    setLobbyLoading(true);
    try {
      await joinLobby(code, name, email);
      if (typeof window !== 'undefined') localStorage.setItem('playerName', name);
      router.push(`/lobby/${code}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Join failed');
      setLobbyLoading(false);
    }
  };

  const doCreate = async (name: string) => {
    const email = typeof window !== 'undefined' ? localStorage.getItem('playerEmail') || '' : '';
    setLobbyLoading(true);
    try {
      const data = await createLobby(name, email);
      if (typeof window !== 'undefined') localStorage.setItem('playerName', name);
      router.push(`/lobby/${data.lobby_id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Create lobby failed');
      setLobbyLoading(false);
    }
  };

  const handleJoinLobby = () => {
    const name = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!name) {
      setPendingAction('join');
      setPopupName('');
      setPopupError('');
      setShowNamePopup(true);
      return;
    }
    doJoin(name);
  };

  const handleCreateLobby = () => {
    const name = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null;
    if (!name) {
      setPendingAction('create');
      setPopupName('');
      setPopupError('');
      setShowNamePopup(true);
      return;
    }
    doCreate(name);
  };

  const handleNameSubmit = async () => {
    const trimmed = popupName.trim();
    if (!trimmed) {
      setPopupError('Please enter a username.');
      return;
    }
    setShowNamePopup(false);
    if (pendingAction === 'join') {
      await doJoin(trimmed);
    } else {
      await doCreate(trimmed);
    }
  };

  return (
    <>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex flex-wrap items-center justify-end gap-2 px-3 py-2 pointer-events-none">
        {/* Right: player info */}
        <div className="pointer-events-auto flex items-center gap-3">
          {isLoggedIn ? (
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setShowUserMenu((v) => !v)}
                className="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10 hover:bg-black/70 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-sm font-bold text-black">
                  {loggedInName[0]?.toUpperCase()}
                </div>
                <span className="text-white font-semibold text-sm">{loggedInName}</span>
                <span className="text-white/60 text-xs ml-1">{showUserMenu ? '▲' : '▼'}</span>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 mt-1 w-40 bg-gray-900 border border-white/20 rounded-lg shadow-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={fetchRelics}
                    className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Your relics
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Link
                href="/login"
                className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold no-underline hover:bg-white/20 transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-sm font-semibold no-underline hover:bg-white/20 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>

      </div>

      {/* Center title */}
      <div className="absolute top-16 left-0 right-0 z-10 flex justify-center pointer-events-none">
        <h1 className="text-white/80 text-lg font-light tracking-[0.3em] uppercase drop-shadow-lg">
          World of Mythos
        </h1>
      </div>

      {/* Bottom: lobby controls */}
      <div className="absolute bottom-44 left-0 right-0 z-20 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap justify-center items-center gap-2 px-3">
          <input
            type="text"
            placeholder="Lobby code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinLobby()}
            className="w-36 p-2 rounded-md bg-black/60 backdrop-blur-sm border border-white/30 text-white placeholder-white/40 focus:outline-none focus:border-white/60 text-sm"
          />
          <button
            type="button"
            onClick={handleJoinLobby}
            disabled={lobbyLoading}
            className="px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/30 text-white font-semibold text-sm hover:bg-white/20 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Join Lobby
          </button>
          <button
            type="button"
            onClick={handleCreateLobby}
            disabled={lobbyLoading}
            className="px-5 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/30 text-white font-semibold text-sm hover:bg-white/20 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {lobbyLoading ? 'Loading...' : 'Create Lobby'}
          </button>
        </div>
      </div>

      {/* Relics modal */}
      {showRelics && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowRelics(false)}
        >
          <div
            className="bg-gray-900 border border-white/20 text-white p-6 rounded-xl shadow-2xl max-w-md w-full mx-4"
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
                <p className="text-white/60">You have no relics yet.</p>
              )}
            </ul>
            <button
              type="button"
              onClick={() => setShowRelics(false)}
              className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white font-semibold text-sm hover:bg-white/20 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Name popup — shown when not logged in */}
      {showNamePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowNamePopup(false)}
        >
          <div
            className="bg-gray-900 border border-white/20 text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-1 text-white">Choose a name</h2>
            <p className="text-sm text-white/60 mb-4">
              Pick a battle name before you {pendingAction === 'join' ? 'join' : 'create'} a lobby.
            </p>
            <input
              type="text"
              placeholder="Your battle name"
              value={popupName}
              onChange={(e) => setPopupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              autoFocus
              className="w-full p-2 rounded-md bg-gray-800 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-white/50 mb-3"
            />
            {popupError && (
              <p className="text-red-400 text-sm mb-3">{popupError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleNameSubmit}
                className="flex-1 py-2 rounded-lg bg-white/20 hover:bg-white/30 font-bold text-white transition-colors cursor-pointer"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={() => setShowNamePopup(false)}
                className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
