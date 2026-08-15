import { RARE_SKINS, skinColor } from '@/lib/frogSkins';

// A small static SVG preview of a Special Wheel (docs/TRADE_UP_PLAN.md
// §8.3) -- 8 alternating slices over the four rare skins, a brass hub, and
// a flapper triangle at 12 o'clock. Deliberately not WheelCanvas: that
// component is built for the full-screen animated spin (rotation, blur,
// landing highlight), and none of that applies to a frozen preview tile.
const SIZE = 112;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 4;
const SLICE_COUNT = 8;

function slicePath(index: number): string {
  const sliceAngle = (2 * Math.PI) / SLICE_COUNT;
  const start = index * sliceAngle - Math.PI / 2;
  const end = start + sliceAngle;
  const x1 = CENTER + RADIUS * Math.cos(start);
  const y1 = CENTER + RADIUS * Math.sin(start);
  const x2 = CENTER + RADIUS * Math.cos(end);
  const y2 = CENTER + RADIUS * Math.sin(end);
  return `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 0 1 ${x2} ${y2} Z`;
}

type Props = {
  className?: string;
};

export default function SpecialWheelEmblem({ className }: Props) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={className}
      role="img"
      aria-label="Special Wheel"
    >
      {Array.from({ length: SLICE_COUNT }, (_, i) => (
        <path key={i} d={slicePath(i)} fill={skinColor(RARE_SKINS[i % RARE_SKINS.length])} />
      ))}
      <circle cx={CENTER} cy={CENTER} r={RADIUS + 2} fill="none" stroke="#78716c" strokeWidth={2} />
      <circle cx={CENTER} cy={CENTER} r={SIZE * 0.12} fill="#b45309" stroke="#78350f" strokeWidth={1.5} />
      <polygon
        points={`${CENTER - 6},2 ${CENTER + 6},2 ${CENTER},14`}
        fill="#f5c542"
        stroke="#78350f"
        strokeWidth={1}
      />
    </svg>
  );
}
