'use client';

import { useEffect, useState } from 'react';
import { BLIMKIN_BREATHE, BLIMKIN_COLS, BLIMKIN_IDLE, BLIMKIN_ROWS, type BlimkinFrame } from '@/lib/blimkinSprite';

// Blimkin bringing a message (Mikael, 2026-10-17): "a void in wherever is
// created and Blimkin comes out and breathes out the cloud with the
// information before he exits into the void again." He looks exactly as he
// does in the statusline (lib/blimkinSprite.ts). The cloud stays after he
// has gone, until whoever shows it takes it away.
//
// A new `appearance` key brings him again; the same key with new content
// only changes the cloud's words (a countdown ticking, the cloud tapped).

/** One cell of the sprite, in rem so it grows with the UI scale. */
const CELL_W = 0.62;
const CELL_H = 1.05;
const SPRITE_W = CELL_W * BLIMKIN_COLS;
const SPRITE_H = CELL_H * BLIMKIN_ROWS;

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

function Sprite({ frame }: { frame: BlimkinFrame }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${BLIMKIN_COLS}, ${CELL_W}rem)`,
        gridAutoRows: `${CELL_H}rem`,
        fontFamily: 'var(--font-geist-mono), Menlo, "DejaVu Sans Mono", monospace',
        fontSize: `${CELL_H * 0.92}rem`,
        lineHeight: `${CELL_H}rem`,
      }}
    >
      {frame.flatMap((row, r) =>
        row.map(([ch, fg, bg], c) => (
          <span
            key={`${r}-${c}`}
            style={{
              color: fg ?? undefined,
              background: bg ?? undefined,
              textAlign: 'center',
              overflow: 'visible',
              whiteSpace: 'pre',
            }}
          >
            {ch}
          </span>
        )),
      )}
    </div>
  );
}

export interface BlimkinCloudProps {
  /** Who/what this message is; a new key summons him again. Null: nothing. */
  appearance: string | null;
  children?: React.ReactNode;
  /** Tapping the cloud itself (buttons inside it stop the tap). */
  onCloudClick?: () => void;
  label?: string;
}

export default function BlimkinCloud({ appearance, children, onCloudClick, label }: BlimkinCloudProps) {
  const [phase, setPhase] = useState<Phase>('gone');
  const [shownKey, setShownKey] = useState<string | null>(null);

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
      className="fixed z-40 pointer-events-none"
      style={{
        left: 'calc(1rem + env(safe-area-inset-left))',
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
      }}
    >
      <div style={{ position: 'relative', width: `${SPRITE_W}rem`, height: `${SPRITE_H}rem` }}>
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
              bottom: 0,
              transform: up ? 'translateY(0)' : 'translateY(105%)',
              transition: phase === 'rising' ? 'transform 420ms cubic-bezier(.2,.9,.3,1.2)' : 'transform 400ms ease-in',
            }}
          >
            <Sprite frame={phase === 'breathing' ? BLIMKIN_BREATHE : BLIMKIN_IDLE} />
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
            bottom: `${SPRITE_H * 0.55}rem`,
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
          {children}
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
