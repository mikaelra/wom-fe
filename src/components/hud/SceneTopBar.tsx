'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logOut, getInventory } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';
import { skinColor, skinThumbnailUrl } from '@/lib/frogSkins';
import RopedButton from '@/components/hud/RopedButton';
import RulesModal from '@/components/lobby/RulesModal';
import MusicToggleButton from '@/components/audio/MusicToggleButton';
import SfxToggleButton from '@/components/audio/SfxToggleButton';

/**
 * The chrome that is the same in every scene: Rules and the music toggle on
 * the left, the player's own menu on the right.
 *
 * Locked decision 4 (docs/CITY_SCENE_PLAN.md §1) is that "Rules and the
 * profile/user menu stay in the top bar on the city page too -- the same
 * chrome the world map has, so the top bar is continuous across scenes."
 * This is that, extracted from WorldMapOverlay so the two scenes cannot
 * drift: one implementation, one set of positions, one user menu.
 *
 * The positioning offsets below were derived against the world map's bottom
 * lobby-controls row, which the city does not have. They are kept anyway --
 * identical chrome was the requirement, and a top bar that shifts as you
 * walk between scenes is exactly what locked decision 4 rules out.
 */

const DEFAULT_SKIN = 'frog_green_v1';

export default function SceneTopBar() {
  const router = useRouter();
  const [loggedInName, setLoggedInName] = useState('');
  const [equippedSkin, setEquippedSkin] = useState(DEFAULT_SKIN);
  const [mounted, setMounted] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setLoggedInName(localStorage.getItem('playerName') || '');
    }
  }, []);

  // Same skin the user-menu button's avatar shows -- see the Inventory
  // page's own equippedSkin fetch, which this mirrors. A failure here just
  // leaves the button on DEFAULT_SKIN rather than blocking anything.
  useEffect(() => {
    const token = getStoredAccountToken();
    if (!token) return;
    getInventory(token)
      .then((data) => setEquippedSkin(data.equipped_skin))
      .catch(() => {});
  }, [loggedInName]);

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
    }
    // Fire-and-forget: logOut() clears the local credential synchronously
    // and treats the server-side revoke as best-effort, so there's nothing
    // to await or handle here.
    logOut(getStoredAccountToken());
    // State update only -- a location.reload() here would tear down and
    // re-initialise the entire WebGL scene just to swap the top-bar button.
    setLoggedInName('');
    setEquippedSkin(DEFAULT_SKIN);
    setShowUserMenu(false);
  };

  // Nothing until hydration: the logged-in state comes from localStorage,
  // which the server cannot know.
  if (!mounted) return null;

  const isLoggedIn = !!loggedInName;

  return (
    <>
      {/* Top bar -- left and right groups are independently pinned to their
          own corner (not one flex row with justify-between) so that if one
          side wraps/shrinks on a narrow phone, it can never bump the other
          side out of position. justify-between only distributes items
          within a shared row; once wrapping split them onto separate rows,
          the lone item left on its own row collapsed to that row's start
          instead of staying pinned right. */}
      {/* Rules button: below `sm` it's just a small corner-pinned floating
          chip (left-3, a plain 12px inset) -- there's no spare width on a
          phone to do anything fancier before it'd collide with the
          right-side button mid-screen. From `sm` up it switches to a fixed
          pixel offset from horizontal center instead of hugging the edge,
          chosen so roughly half the button overlaps the outer half of
          "Enter lobby code..." in the bottom lobby-controls row below.

          That row is centered with fixed widths -- RopedInput(184) +
          RopedButton(168), no gap = 352px total -- so "Enter lobby
          code..."'s left edge always sits at `center - 176px`, regardless
          of viewport width. This button is 163px wide; pinning its
          *outer* (left) edge to `center - 257px` puts its span at
          [center-257px, center-94px], whose rightmost ~82px (half its own
          163px width), [center-176px, center-94px], lands almost exactly
          on that 176px mark. 257px still keeps the button fully on-screen
          with margin all the way down to the 640px breakpoint boundary
          (outer edge sits 63px in from the viewport's left edge on a
          640px-wide screen), and the overlap ratio stays constant at any
          wider viewport since it's a fixed pixel offset from center, not
          a percentage. */}
      <div
        className="absolute top-0 left-3 sm:left-[calc(50%-257px)] z-20 pointer-events-none"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          <RopedButton
            // 163 -- same exact-fit width as the user-menu chip (see its own
            // comment): rope_button-ld-v2.png's natural size is 595x197
            // (~3.02:1), and 163 is the exact width at which it fills a
            // 54px-tall box edge-to-edge, so every RopedButton in this top
            // bar reads as the same consistent chip size.
            width={163}
            height={54}
            onClick={() => setShowRules(true)}
            ariaLabel="Rules"
          >
            Rules
          </RopedButton>
          <MusicToggleButton />
          {/* The sound-effects toggle was only ever rendered in the lobby
              (LobbyOverlay), so every screen carrying this bar -- the city
              included -- offered a music button and no way at all to mute
              the effects. */}
          <SfxToggleButton />
        </div>
      </div>
      <div
        // User-menu / "Log in" button: mirrors the Rules button's logic on
        // the other side (see its comment above for the full derivation),
        // overlapping "Join Lobby" instead of "Enter lobby code...". Below
        // `sm` it's a small corner-pinned floating chip (right-3, a plain
        // 12px inset). From `sm` up its *outer* (right) edge is pinned to
        // `center + 257px` -- "Join Lobby"'s right edge always sits at
        // `center + 176px` (352px-wide centered row: RopedInput(184) +
        // RopedButton(168), no gap), and this button is 163px wide (153px
        // for the "Log in" variant, which isn't special-cased -- close
        // enough to read the same), so its span [center+94px,
        // center+257px] has its inner (leftmost) ~82px (half its own
        // 163px width) landing almost exactly on that 176px mark. Same
        // 257px offset as the left side, so it keeps the same on-screen
        // margin down to the 640px breakpoint and the same constant
        // overlap ratio at any wider viewport.
        className="absolute top-0 right-3 sm:right-[calc(50%-257px)] z-20 pointer-events-none"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
      >
        {/* Right: player info */}
        <div className="pointer-events-auto flex items-center gap-3">
          {!isLoggedIn && (
            <RopedButton
              width={153}
              height={54}
              onClick={() => router.push('/login')}
              ariaLabel="Log in"
            >
              Log in
            </RopedButton>
          )}
          {isLoggedIn && (
            <div className="relative" ref={userMenuRef}>
              <RopedButton
                // rope_button-ld-v2.png's natural size is 595x197 (~3.02:1).
                // object-contain fits by height whenever the box is wider
                // than that ratio, so any width above ~163 (595/197*54)
                // just letterboxes -- empty transparent margin on both
                // sides of the art, with the box's true edges landing well
                // outside the visibly drawn rope frame. 163 is the exact
                // width at which the art fills the box edge-to-edge, so
                // this chip's visible right edge lines up precisely with
                // Join Lobby's (see the `right` calc below) instead of
                // sitting inside a padded box that only *measures* aligned.
                width={163}
                height={54}
                onClick={() => setShowUserMenu((v) => !v)}
                ariaLabel="Open user menu"
                textClassName="flex items-center gap-2 text-white font-semibold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              >
                <span
                  className="w-7 h-7 rounded-full border border-white/20 overflow-hidden shrink-0"
                  style={{ background: skinColor(equippedSkin) }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a small
                      fixed set of local static assets, not remote/user content */}
                  <img
                    src={skinThumbnailUrl(equippedSkin)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </span>
                <span>{loggedInName}</span>
                <span className="text-white/70 text-xs">{showUserMenu ? '▲' : '▼'}</span>
              </RopedButton>
              {showUserMenu && (
                <div className="absolute right-0 mt-1 w-40 bg-gray-900 border border-white/20 rounded-lg shadow-xl overflow-hidden">
                  <Link
                    href="/stats"
                    onClick={() => setShowUserMenu(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer no-underline"
                  >
                    Stats
                  </Link>
                  <Link
                    href="/inventory"
                    onClick={() => setShowUserMenu(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer no-underline"
                  >
                    Inventory
                  </Link>
                  <Link
                    href="/my-ai"
                    onClick={() => setShowUserMenu(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer no-underline"
                  >
                    My AI
                  </Link>
                  <Link
                    href="/shop"
                    onClick={() => setShowUserMenu(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer no-underline"
                  >
                    Shop
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors cursor-pointer no-underline"
                  >
                    Settings
                  </Link>
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
          )}
        </div>

      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </>
  );
}
