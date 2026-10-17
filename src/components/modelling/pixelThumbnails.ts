// The 8-bit thumbnails (scripts/pixel-thumbnails.py -> public/pixel/), each
// with the picture it would replace, for the review page at
// /modelling/thumbnails (Mikael, 2026-10-17).

export interface PixelThumbnail {
  id: string;
  label: string;
  /** Today's picture of the same thing, if there is one. */
  was?: string;
}

const skin = (id: string, label: string): PixelThumbnail => ({ id, label, was: `/skins/thumbnails/${id}.png` });

export const PIXEL_GROUPS: { title: string; items: PixelThumbnail[] }[] = [
  {
    title: 'Frogs',
    items: [
      skin('frog_green_v1', 'Green'),
      skin('frog_blue_v1', 'Blue'),
      skin('frog_orange_cursed_v1', 'Orange (cursed)'),
      skin('frog_pink_v1', 'Pink'),
      skin('frog_purple_v1', 'Purple'),
      skin('frog_red_v1', 'Red'),
      skin('frog_yellow_v1', 'Yellow'),
      skin('frog_silver_v1', 'Silver'),
      skin('frog_gold_v1', 'Gold'),
      skin('frog_rainbow_v2', 'Rainbow'),
      skin('frog_bling_v1', 'Bling'),
      skin('cherub_v1', 'Cherub'),
    ],
  },
  {
    title: 'Relics (inventory and the merchants)',
    items: [
      { id: 'pen', label: 'Pen', was: '/models/relics/pen_v1.thumbnail.png' },
      { id: 'paper', label: 'Paper' },
      { id: 'stone', label: 'Stone of Vitality (now green)' },
    ],
  },
  {
    title: 'Wheels and the artifact',
    items: [
      { id: 'wheel', label: 'Wheel', was: '/images/wheel.png' },
      { id: 'special-wheel', label: 'Special Wheel', was: '/images/special-wheel.png' },
      { id: 'artifact', label: 'Artifact (the scroll, its 3D model)' },
    ],
  },
];

export const pixelUrl = (id: string) => `/pixel/${id}.png`;
