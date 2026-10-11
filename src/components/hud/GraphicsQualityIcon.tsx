import type { GraphicsQuality } from '@/lib/graphicsQuality';

// The graphics qualities as icons (Mikael, 2026-10-11): a low-res cube for
// SD, drawn in big square pixels; a smooth, shaded cube for HD; a T for
// Text.

function LowResCube() {
  // An isometric cube on a 8x8 grid, crisp edges: three flat shades.
  const px = (x: number, y: number, w: number, h: number, fill: string) => (
    <rect key={`${x}-${y}-${fill}`} x={x} y={y} width={w} height={h} fill={fill} />
  );
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" shapeRendering="crispEdges" aria-hidden="true">
      {px(3, 0, 2, 1, '#e5e7eb')}
      {px(1, 1, 6, 1, '#e5e7eb')}
      {px(2, 2, 4, 1, '#e5e7eb')}
      {px(0, 2, 2, 1, '#9ca3af')}
      {px(6, 2, 2, 1, '#6b7280')}
      {px(0, 3, 4, 3, '#9ca3af')}
      {px(4, 3, 4, 3, '#6b7280')}
      {px(1, 6, 3, 1, '#9ca3af')}
      {px(4, 6, 3, 1, '#6b7280')}
      {px(3, 7, 1, 1, '#9ca3af')}
      {px(4, 7, 1, 1, '#6b7280')}
    </svg>
  );
}

function HighResCube() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <defs>
        <linearGradient id="hd-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d1d5db" />
        </linearGradient>
        <linearGradient id="hd-left" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4c9d1" />
          <stop offset="1" stopColor="#8b919b" />
        </linearGradient>
        <linearGradient id="hd-right" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b919b" />
          <stop offset="1" stopColor="#4b5059" />
        </linearGradient>
      </defs>
      <path d="M12 2.5 21 7.5 12 12.5 3 7.5Z" fill="url(#hd-top)" />
      <path d="M3 7.5 12 12.5V22L3 17Z" fill="url(#hd-left)" />
      <path d="M21 7.5 12 12.5V22L21 17Z" fill="url(#hd-right)" />
      <path d="M12 2.5 21 7.5V17L12 22 3 17V7.5Z M3 7.5 12 12.5 21 7.5 M12 12.5V22" fill="none" stroke="#f3f4f6" strokeWidth="0.6" strokeLinejoin="round" />
    </svg>
  );
}

function TextT() {
  return (
    <span aria-hidden="true" className="text-[17px] font-black leading-none text-white" style={{ fontFamily: 'Georgia, serif' }}>
      T
    </span>
  );
}

export const QUALITY_LABEL: Record<GraphicsQuality, string> = {
  text: 'Text',
  sd: 'SD',
  hd: 'HD',
};

export default function GraphicsQualityIcon({ quality }: { quality: GraphicsQuality }) {
  if (quality === 'hd') return <HighResCube />;
  if (quality === 'sd') return <LowResCube />;
  return <TextT />;
}
