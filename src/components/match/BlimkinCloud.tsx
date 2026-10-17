'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { anchorOverField, typingField } from '@/lib/blimkinAnchor';
import { getEarthOnScreen, subscribeEarthOnScreen, type ScreenPoint } from '@/lib/earthOnScreen';
import { useTextMode } from '@/lib/textMode';

// Standard and High Definition show him in 3D; Low Definition has no 3D, so it
// keeps his 8-bit picture. Loaded only when a cloud is up in those modes.
const BlimkinModel3D = dynamic(() => import('@/components/match/BlimkinModel3D'), { ssr: false });

// Blimkin bringing a message (Mikael, 2026-10-17): "a void in wherever is
// created and Blimkin comes out and breathes out the cloud with the
// information before he exits into the void again." He is the 8-bit Blimkin
// of the thumbnail (public/pixel/blimkin_v1.png, drawn by scripts/pixel-
// thumbnails.py), no longer the statusline's cells (Mikael, 2026-10-17). The
// cloud stays up after he
// has gone, until the cross in its top-right corner closes it (Mikael,
// 2026-10-17) or whoever shows it takes it away.
//
// A new `appearance` key brings him again; the same key with new content
// only changes the cloud's words (a countdown ticking, the cloud tapped).
//
// He comes up over everything, open windows included (a trade being
// crafted, say), and when the player is typing he comes out right over the
// field they're typing in, keyboard and all, rather than in his corner
// under it (Mikael, 2026-10-17).

/** His picture: square, in rem so it grows with the UI scale. */
const BLIMKIN_URL = '/pixel/blimkin_v1.png';
const SPRITE_W = 7.4;
const SPRITE_H = 7.4;
/** Only the top of him comes through the void: his arms show, his legs stay
 *  below its lip (Mikael, 2026-10-17). */
const HIDDEN = SPRITE_H * 0.18;
const BOX_H = SPRITE_H - HIDDEN;
/** The cloud leaves his mouth, which is low on the picture. */
const CLOUD_BOTTOM = SPRITE_H * 0.4 - HIDDEN;

type Phase = 'opening' | 'rising' | 'breathing' | 'sinking' | 'closing' | 'gone';

/** When each phase begins, in ms after he is summoned. */
const TIMELINE: [Phase, number][] = [
  ['opening', 0],
  ['rising', 280],
  ['breathing', 760],
  ['sinking', 1260],
  ['closing', 1700],
  ['gone', 1980],
];

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function Sprite({ breathing }: { breathing: boolean }) {
  const lowDefinition = useTextMode();
  // Nothing until the mode is known, so a Low Definition player never starts
  // loading a 3D model.
  if (lowDefinition === null) return null;
  const style = {
    display: 'block',
    width: `${SPRITE_W}rem`,
    height: `${SPRITE_H}rem`,
    // Breathing the cloud out: he swells, then settles.
    transform: breathing ? 'scale(1.06, 0.95)' : 'none',
    transformOrigin: '50% 100%',
    transition: 'transform 220ms ease-out',
  } as const;
  if (lowDefinition) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small static file from public/
      <img src={BLIMKIN_URL} alt="" aria-hidden="true" draggable={false} style={{ ...style, imageRendering: 'pixelated' }} />
    );
  }
  return (
    <div aria-hidden="true" data-testid="blimkin-3d" style={style}>
      <BlimkinModel3D />
    </div>
  );
}

export interface BlimkinCloudProps {
  /** Who/what this message is; a new key summons him again. Null: nothing. */
  appearance: string | null;
  children?: React.ReactNode;
  /** Tapping the cloud itself (buttons inside it stop the tap). */
  onCloudClick?: () => void;
  /** The cross in the cloud's top-right corner. */
  onClose?: () => void;
  /** Where he stands when nobody is typing: his corner; the middle of the
   *  screen with the cloud over it; or springing out from on top of the
   *  Earth on the Low Definition Earth (the middle for the 3D Earth). */
  placement?: 'corner' | 'center' | 'earth';
  label?: string;
}

export default function BlimkinCloud({
  appearance,
  children,
  onCloudClick,
  onClose,
  label,
  placement = 'corner',
}: BlimkinCloudProps) {
  const [phase, setPhase] = useState<Phase>('gone');
  const [shownKey, setShownKey] = useState<string | null>(null);
  // Where he stands: his corner, or just over the field being typed in.
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
  // The Earth he springs out from.
  const [earth, setEarth] = useState<ScreenPoint | null>(null);
  useEffect(() => {
    if (placement !== 'earth' || !appearance) return;
    setEarth(getEarthOnScreen());
    return subscribeEarthOnScreen(() => setEarth(getEarthOnScreen()));
  }, [placement, appearance]);

  useEffect(() => {
    if (!appearance) return;
    const place = () => {
      const field = typingField(document.activeElement);
      setAnchor(field ? anchorOverField(field.getBoundingClientRect(), window.innerWidth, window.innerHeight) : null);
    };
    place();
    const vv = window.visualViewport;
    document.addEventListener('focusin', place);
    document.addEventListener('focusout', place);
    window.addEventListener('resize', place);
    vv?.addEventListener('resize', place);
    vv?.addEventListener('scroll', place);
    return () => {
      document.removeEventListener('focusin', place);
      document.removeEventListener('focusout', place);
      window.removeEventListener('resize', place);
      vv?.removeEventListener('resize', place);
      vv?.removeEventListener('scroll', place);
    };
  }, [appearance]);

  useEffect(() => {
    setShownKey(appearance);
    if (!appearance) return;
    if (prefersReducedMotion()) {
      setPhase('gone');
      return;
    }
    setPhase('opening');
    const timers = TIMELINE.map(([p, at]) => setTimeout(() => setPhase(p), at));
    return () => timers.forEach(clearTimeout);
  }, [appearance]);

  if (!appearance || shownKey !== appearance) return null;

  const voidOpen = phase === 'rising' || phase === 'breathing' || phase === 'sinking';
  const voidScale = phase === 'opening' || phase === 'closing' ? 0.55 : voidOpen ? 1 : 0;
  const up = phase === 'breathing' || phase === 'rising';
  const cloudOut = phase === 'breathing' || phase === 'sinking' || phase === 'closing' || phase === 'gone';

  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={
        anchor
          ? { left: `${anchor.left}px`, bottom: `${anchor.bottom}px` }
          : placement === 'earth' && earth
            ? {
                // His feet, and the void, on top of the Earth.
                left: `calc(${Math.round(earth.x)}px - ${(SPRITE_W / 2).toFixed(2)}rem)`,
                bottom: `calc(100% - ${Math.round(earth.y)}px)`,
              }
            : placement !== 'corner'
            ? {
                // The cloud (up and right of him) centred on the screen.
                left: `max(0.5rem, calc(50% - ${(SPRITE_W * 0.72 + 6.5).toFixed(2)}rem))`,
                bottom: `calc(50% - ${(CLOUD_BOTTOM + 1.5).toFixed(2)}rem)`,
              }
            : {
                left: 'calc(1rem + env(safe-area-inset-left))',
                bottom: 'calc(1rem + env(safe-area-inset-bottom))',
              }
      }
    >
      <div style={{ position: 'relative', width: `${SPRITE_W}rem`, height: `${BOX_H}rem` }}>
        {/* The void he comes out of: a hole in whatever is behind. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-0.6rem',
            right: '-0.6rem',
            bottom: '-0.7rem',
            height: '1.6rem',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, #000 0%, #000 55%, rgba(60,0,90,0.85) 75%, rgba(60,0,90,0) 100%)',
            transform: `scaleX(${voidScale}) scaleY(${voidScale})`,
            opacity: voidScale ? 1 : 0,
            transition: 'transform 260ms ease-out, opacity 260ms ease-out',
          }}
        />
        {/* Blimkin, clipped at the void's lip so he rises out of it. */}
        <div style={{ position: 'absolute', inset: `-${SPRITE_H}rem 0 0 0`, overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: `-${HIDDEN}rem`, // the legs below the void's lip
              transform: up ? 'translateY(0)' : 'translateY(105%)',
              transition: phase === 'rising' ? 'transform 420ms cubic-bezier(.2,.9,.3,1.2)' : 'transform 400ms ease-in',
            }}
          >
            <Sprite breathing={phase === 'breathing'} />
          </div>
        </div>
        {/* The cloud he breathes out, from his mouth up and to the right. */}
        <div
          role={onCloudClick ? 'button' : 'status'}
          aria-label={label}
          tabIndex={onCloudClick ? 0 : undefined}
          onClick={onCloudClick}
          onKeyDown={(e) => {
            if (onCloudClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onCloudClick();
            }
          }}
          className="pointer-events-auto"
          style={{
            position: 'absolute',
            left: `${SPRITE_W * 0.72}rem`,
            bottom: `${CLOUD_BOTTOM}rem`,
            minWidth: '11rem',
            maxWidth: 'min(18rem, calc(100vw - 7rem))',
            padding: '0.65rem 0.9rem',
            background: '#fdfdf8',
            color: '#111',
            borderRadius: '1.4rem',
            boxShadow: '0 0 0 2px #111, 0 6px 18px rgba(0,0,0,0.45)',
            fontSize: '0.85rem',
            lineHeight: 1.35,
            cursor: onCloudClick ? 'pointer' : 'default',
            transformOrigin: '0% 100%',
            transform: cloudOut ? 'scale(1)' : 'scale(0.15)',
            opacity: cloudOut ? 1 : 0,
            transition: 'transform 380ms cubic-bezier(.2,.9,.3,1.25), opacity 220ms ease-out',
          }}
        >
          {/* Puffs trailing back to where his mouth was. */}
          <span aria-hidden="true" style={puff('-0.55rem', '-0.35rem', '0.7rem')} />
          <span aria-hidden="true" style={puff('-1.05rem', '-0.85rem', '0.42rem')} />
          {onClose && (
            <button
              type="button"
              aria-label="Close"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="cursor-pointer"
              style={{
                position: 'absolute',
                top: '0.3rem',
                right: '0.45rem',
                width: '1.4rem',
                height: '1.4rem',
                lineHeight: '1.4rem',
                textAlign: 'center',
                fontSize: '1rem',
                fontWeight: 700,
                color: '#111',
                background: 'transparent',
                border: 'none',
                padding: 0,
              }}
            >
              ×
            </button>
          )}
          <div style={{ paddingRight: onClose ? '1.1rem' : undefined }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

function puff(left: string, bottom: string, size: string): React.CSSProperties {
  return {
    position: 'absolute',
    left,
    bottom,
    width: size,
    height: size,
    borderRadius: '50%',
    background: '#fdfdf8',
    boxShadow: '0 0 0 2px #111',
  };
}
