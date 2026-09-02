// The market's client-side types and pure helpers (wom-be
// docs/MARKET_PLAN.md, direct-swap model §1A). No React, no fetch -- the
// shapes come from @/lib/schemas, the API calls from @/lib/api, and the
// live socket state from @/lib/useMarketConnection.
import type { z } from 'zod';
import {
  MarketItemSchema,
  MarketListingSchema,
  MarketCatalogResponseSchema,
  MarketChatMessageSchema,
  MarketTradeSchema,
} from '@/lib/schemas';
import { skinLabel } from '@/lib/frogSkins';
import { wheelKindLabel } from '@/lib/wheelGeometry';

export const MARKET_PATH = '/market';

/** Each Hades' Coin spent on a /longoffer buys this many hours, 1-4 coins
 *  -> 6/12/18/24h (§1A.3). Mirrors wom-be domain/market.py. */
export const LONG_HOURS_PER_COIN = 6;
export const MAX_LONG_COINS = 4;
/** A free /offer lives on the board for this long (§1A.1). */
export const QUICK_TTL_SECONDS = 60;

/** The starter green frog every account already owns -- it has no trade
 *  value, so it never appears in the craft picker. Mirrors wom-be
 *  domain/market.py, which drops it from MARKET_SKIN_CATALOG and rejects
 *  it in normalize_item on both sides. */
export const NON_TRADEABLE_SKIN = 'frog_green_v1';

export type MarketItem = z.infer<typeof MarketItemSchema>;
export type MarketListing = z.infer<typeof MarketListingSchema>;
export type MarketCatalog = z.infer<typeof MarketCatalogResponseSchema>;
export type MarketChatEntry = z.infer<typeof MarketChatMessageSchema>;
export type MarketTrade = z.infer<typeof MarketTradeSchema>;

/** The market chat pane is ambient presence, not a scrollback log: it
 *  shows only the last hour. wom-be caps the join backlog to the same
 *  window (sockets/market.py CHAT_BACKLOG_WINDOW); the client re-applies
 *  it so a message posted while the tab was open still drops off once it
 *  ages out. Everything older lives in the History view instead. */
export const MARKET_CHAT_WINDOW_MS = 60 * 60 * 1000;

/** The subset of `messages` posted within the last hour of `nowMs`, order
 *  preserved. An entry whose timestamp doesn't parse is kept -- a bad
 *  clock on one line shouldn't silently eat it. */
export function recentChat(
  messages: MarketChatEntry[],
  nowMs: number = Date.now(),
): MarketChatEntry[] {
  const cutoff = nowMs - MARKET_CHAT_WINDOW_MS;
  return messages.filter((m) => {
    const t = new Date(m.timestamp).getTime();
    return Number.isNaN(t) || t >= cutoff;
  });
}

/** What the craft modal sends per item. Only the field matching item_type
 *  is set. */
export type MarketItemInput = {
  item_type: 'skin' | 'relic' | 'wheel';
  skin?: string;
  relic_id?: number;
  wheel_kind?: string;
  quantity: number;
};

/** A stable identity for an item on a listing side -- for React keys and
 *  for merging duplicates in the craft modal. Accepts both the wire shape
 *  (nullable fields) and the craft-input shape (optional fields). */
export function itemKey(item: {
  item_type: string;
  skin?: string | null;
  relic_id?: number | null;
  wheel_kind?: string | null;
}): string {
  if (item.item_type === 'skin') return `skin:${item.skin}`;
  if (item.item_type === 'relic') return `relic:${item.relic_id}`;
  return `wheel:${item.wheel_kind}`;
}

/** Human name for one item, without the quantity. */
export function itemName(
  item: Pick<MarketItem, 'item_type' | 'skin' | 'relic_id' | 'wheel_kind'>,
  catalog: Pick<MarketCatalog, 'relics'> | null,
): string {
  if (item.item_type === 'skin') return capitalize(skinLabel(item.skin ?? ''));
  if (item.item_type === 'wheel') return wheelKindLabel(item.wheel_kind ?? '');
  const relic = catalog?.relics.find((r) => r.id === item.relic_id);
  return relic?.name ?? `Relic #${item.relic_id}`;
}

/** Human name plus " ×N" when quantity > 1. */
export function itemLabel(item: MarketItem, catalog: Pick<MarketCatalog, 'relics'> | null): string {
  const base = itemName(item, catalog);
  return item.quantity > 1 ? `${base} ×${item.quantity}` : base;
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Whole seconds left before a listing expires, measured against the
 *  server clock: `clockOffsetMs` is (serverTime - clientTime) captured on
 *  the last fetch, so a skewed local clock doesn't make a 60s trade look
 *  already-dead or immortal. Never negative. */
export function secondsRemaining(expiresAtIso: string, clockOffsetMs: number): number {
  const now = Date.now() + clockOffsetMs;
  const ms = new Date(expiresAtIso).getTime() - now;
  return Math.max(0, Math.floor(ms / 1000));
}

/** "0:47" / "3h 12m" -- compact time-remaining for a board card. */
export function formatRemaining(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `0:${String(seconds).padStart(2, '0')}`;
}

/** The board time a /longoffer buys for `coins` coins. */
export function longOfferHours(coins: number): number {
  return LONG_HOURS_PER_COIN * clampCoins(coins);
}

export function clampCoins(coins: number): number {
  return Math.max(1, Math.min(MAX_LONG_COINS, Math.floor(coins || 1)));
}

/** Fold a client-crafted item list, merging entries that name the same
 *  underlying item (summing quantity) -- the backend does the same, and a
 *  split entry would under-deliver on accept. */
export function mergeItemInputs(items: MarketItemInput[]): MarketItemInput[] {
  const out = new Map<string, MarketItemInput>();
  for (const it of items) {
    const key = itemKey(it as MarketItem);
    const prev = out.get(key);
    if (prev) prev.quantity += it.quantity;
    else out.set(key, { ...it });
  }
  return [...out.values()];
}

export function listingIsMine(listing: MarketListing, myPlayerId: number | null): boolean {
  return myPlayerId != null && listing.seller_player_id === myPlayerId;
}
