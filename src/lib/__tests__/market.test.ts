import { describe, expect, it } from 'vitest';
import {
  artifactTradeProblem,
  hasPaperAndPen,
  clampCoins,
  formatRemaining,
  itemKey,
  itemLabel,
  itemName,
  listingIsMine,
  tradeName,
  tradeNamePast,
  tradeNoun,
  copyMark,
  ledgerMarks,
  longOfferHours,
  mergeItemInputs,
  NON_TRADEABLE_SKIN,
  recentChat,
  secondsRemaining,
  LONG_HOURS_PER_COIN,
  MARKET_CHAT_WINDOW_MS,
  MAX_LONG_COINS,
  type MarketChatEntry,
  type MarketItem,
  type MarketItemInput,
  type MarketListing,
} from '@/lib/market';

const item = (over: Partial<MarketItem> = {}): MarketItem => ({
  item_type: 'skin',
  skin: 'frog_gold_v1',
  relic_id: null,
  wheel_kind: null,
  quantity: 1,
  ...over,
});

const catalog = { relics: [{ id: 1, name: "Hades' Coin" }] };

describe('itemKey', () => {
  it('keys each item type off its own identifying field', () => {
    expect(itemKey({ item_type: 'skin', skin: 'frog_gold_v1' })).toBe('skin:frog_gold_v1');
    expect(itemKey({ item_type: 'relic', relic_id: 1 })).toBe('relic:1');
    expect(itemKey({ item_type: 'wheel', wheel_kind: 'special' })).toBe('wheel:special');
  });

  it('accepts both the nullable wire shape and the optional craft-input shape', () => {
    expect(itemKey(item({ item_type: 'relic', skin: null, relic_id: 2 }))).toBe('relic:2');
    const input: MarketItemInput = { item_type: 'wheel', wheel_kind: 'normal', quantity: 1 };
    expect(itemKey(input)).toBe('wheel:normal');
  });
});

describe('itemName / itemLabel', () => {
  it('names a skin and a wheel from their own fields, no catalog needed', () => {
    expect(itemName(item({ skin: 'frog_gold_v1' }), null)).toMatch(/gold/i);
    expect(itemName(item({ item_type: 'wheel', skin: null, wheel_kind: 'special' }), null)).toMatch(/wheel/i);
  });

  it('looks a relic name up in the catalog, falling back to its id', () => {
    const relic = item({ item_type: 'relic', skin: null, relic_id: 1 });
    expect(itemName(relic, catalog)).toBe("Hades' Coin");
    expect(itemName(item({ item_type: 'relic', skin: null, relic_id: 9 }), catalog)).toBe('Relic #9');
  });

  it('appends the quantity only when it is greater than one', () => {
    expect(itemLabel(item({ quantity: 1 }), null)).not.toMatch(/×/);
    expect(itemLabel(item({ quantity: 3 }), null)).toMatch(/×3$/);
  });

  it('shows ai_credits as a count-prefixed currency, never with ×', () => {
    const credits = item({ item_type: 'ai_credits', skin: null, quantity: 50 });
    expect(itemKey(credits)).toBe('ai_credits');
    expect(itemName(credits, null)).toBe('AI credits');
    expect(itemLabel(credits, null)).toBe('50 AI credits');
    expect(itemLabel(item({ item_type: 'ai_credits', skin: null, quantity: 1 }), null)).toBe('1 AI credits');
  });
});

describe('secondsRemaining', () => {
  it('counts whole seconds to the expiry against the server-corrected clock', () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    const s = secondsRemaining(future, 0);
    expect(s).toBeGreaterThanOrEqual(28);
    expect(s).toBeLessThanOrEqual(30);
  });

  it('never goes negative once the listing is dead', () => {
    expect(secondsRemaining(new Date(Date.now() - 5_000).toISOString(), 0)).toBe(0);
  });

  it('applies the clock offset so a skewed local clock cannot misjudge it', () => {
    const future = new Date(Date.now() + 10_000).toISOString();
    // offset = serverTime - localTime; a local clock 60s *behind* the
    // server pushes "now" forward past a 10s-nominal expiry -> already gone.
    expect(secondsRemaining(future, 60_000)).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('shows hours and minutes past an hour', () => {
    expect(formatRemaining(3 * 3600 + 12 * 60)).toBe('3h 12m');
  });
  it('shows m:ss between a minute and an hour', () => {
    expect(formatRemaining(125)).toBe('2:05');
  });
  it('shows 0:ss under a minute', () => {
    expect(formatRemaining(7)).toBe('0:07');
  });
});

describe('coin helpers', () => {
  it('longOfferHours is six hours per clamped coin', () => {
    expect(longOfferHours(2)).toBe(2 * LONG_HOURS_PER_COIN);
    expect(longOfferHours(99)).toBe(MAX_LONG_COINS * LONG_HOURS_PER_COIN);
  });
  it('clampCoins holds the 1..4 range and defaults a bad value to 1', () => {
    expect(clampCoins(0)).toBe(1);
    expect(clampCoins(3)).toBe(3);
    expect(clampCoins(10)).toBe(4);
    expect(clampCoins(Number.NaN)).toBe(1);
  });
});

describe('mergeItemInputs', () => {
  it('folds entries that name the same underlying item, summing quantity', () => {
    const merged = mergeItemInputs([
      { item_type: 'skin', skin: 'frog_gold_v1', quantity: 1 },
      { item_type: 'skin', skin: 'frog_gold_v1', quantity: 2 },
      { item_type: 'wheel', wheel_kind: 'special', quantity: 1 },
    ]);
    expect(merged).toEqual([
      { item_type: 'skin', skin: 'frog_gold_v1', quantity: 3 },
      { item_type: 'wheel', wheel_kind: 'special', quantity: 1 },
    ]);
  });
});

describe('listingIsMine', () => {
  const listing = { seller_player_id: 7 } as MarketListing;
  it('is true only when the ids match and the viewer is known', () => {
    expect(listingIsMine(listing, 7)).toBe(true);
    expect(listingIsMine(listing, 8)).toBe(false);
    expect(listingIsMine(listing, null)).toBe(false);
  });
});

describe('NON_TRADEABLE_SKIN', () => {
  it('is the starter green frog', () => {
    expect(NON_TRADEABLE_SKIN).toBe('frog_green_v1');
  });
});

describe('recentChat', () => {
  const now = Date.parse('2026-09-02T12:00:00Z');
  const msg = (minsAgo: number, message: string): MarketChatEntry => ({
    sender: 'Bo',
    message,
    timestamp: new Date(now - minsAgo * 60_000).toISOString(),
  });

  it('is a one-hour window', () => {
    expect(MARKET_CHAT_WINDOW_MS).toBe(60 * 60 * 1000);
  });

  it('keeps only messages from the last hour, order preserved', () => {
    const kept = recentChat(
      [msg(180, 'ancient'), msg(59, 'recent'), msg(1, 'newest')],
      now,
    );
    expect(kept.map((m) => m.message)).toEqual(['recent', 'newest']);
  });

  it('treats exactly one hour old as still inside the window', () => {
    expect(recentChat([msg(60, 'edge')], now)).toHaveLength(1);
  });

  it('keeps a line whose timestamp does not parse rather than eating it', () => {
    const bad: MarketChatEntry = { sender: 'Bo', message: 'weird clock', timestamp: 'not-a-date' };
    expect(recentChat([bad], now)).toEqual([bad]);
  });

  it('defaults to the real clock when no now is given', () => {
    const fresh: MarketChatEntry = {
      sender: 'Bo',
      message: 'hi',
      timestamp: new Date().toISOString(),
    };
    expect(recentChat([fresh])).toEqual([fresh]);
  });
});

describe('Paper + Pen -> Artifact (wom-be MARKET_PLAN.md §1B)', () => {
  const IDS = { paper_relic_id: 11, pen_relic_id: 12 };
  const artifact = { item_type: 'artifact' as const };
  const paper = { item_type: 'relic' as const, relic_id: 11 };
  const pen = { item_type: 'relic' as const, relic_id: 12 };
  const coin = { item_type: 'relic' as const, relic_id: 1 };

  it('names and keys the Artifact', () => {
    const item = { item_type: 'artifact' as const, skin: null, relic_id: null, wheel_kind: null };
    expect(itemName(item, null)).toBe('Artifact');
    expect(itemKey(item)).toBe('artifact');
  });

  it('allows an Artifact opposite a Paper and a Pen, either way round, alongside anything', () => {
    expect(artifactTradeProblem([artifact], [paper, pen], IDS)).toBeNull();
    expect(artifactTradeProblem([paper, pen, coin], [artifact], IDS)).toBeNull();
    expect(artifactTradeProblem([coin], [coin], IDS)).toBeNull();
  });

  it('needs both a Paper and a Pen on the other side of the Artifact', () => {
    expect(artifactTradeProblem([artifact], [coin], IDS)).toMatch(/Paper and a Pen on the other side/);
    expect(artifactTradeProblem([artifact], [paper], IDS)).toMatch(/Paper and a Pen on the other side/);
    expect(artifactTradeProblem([artifact], [pen], IDS)).toMatch(/Paper and a Pen on the other side/);
    expect(artifactTradeProblem([paper], [artifact], IDS)).toMatch(/Paper and a Pen on your side/);
    expect(artifactTradeProblem([artifact, paper, pen], [coin], IDS)).toMatch(/Paper and a Pen on the other side/);
  });

  it('refuses an Artifact on both sides, or any Artifact without known Paper and Pen', () => {
    expect(artifactTradeProblem([artifact, paper, pen], [artifact, paper, pen], IDS)).toMatch(/both sides/);
    expect(artifactTradeProblem([artifact], [paper, pen], null)).not.toBeNull();
    expect(artifactTradeProblem([artifact], [paper, pen], { paper_relic_id: 11 })).not.toBeNull();
  });

  it('hasPaperAndPen needs both on the one side', () => {
    expect(hasPaperAndPen([paper, pen], IDS)).toBe(true);
    expect(hasPaperAndPen([paper], IDS)).toBe(false);
    expect(hasPaperAndPen([pen, coin], IDS)).toBe(false);
    expect(hasPaperAndPen([paper, pen], undefined)).toBe(false);
  });
});

describe('tradeName -- Transcribe / Transcribe and Trade', () => {
  const IDS = { paper_relic_id: 11, pen_relic_id: 12 };
  const artifact = { item_type: 'artifact', quantity: 1 };
  const paper = (quantity = 1) => ({ item_type: 'relic', relic_id: 11, quantity });
  const pen = (quantity = 1) => ({ item_type: 'relic', relic_id: 12, quantity });
  const coin = { item_type: 'relic', relic_id: 1, quantity: 1 };

  it('is a Transcribe when only the Artifact, one Paper and one Pen are on it, either way round', () => {
    expect(tradeName([artifact], [paper(), pen()], IDS)).toBe('Transcribe');
    expect(tradeName([paper(), pen()], [artifact], IDS)).toBe('Transcribe');
  });

  it('is a Transcribe and Trade when anything else rides along', () => {
    expect(tradeName([artifact, coin], [paper(), pen()], IDS)).toBe('Transcribe and Trade');
    expect(tradeName([artifact], [paper(), pen(), coin], IDS)).toBe('Transcribe and Trade');
    expect(tradeName([artifact], [paper(2), pen()], IDS)).toBe('Transcribe and Trade');
    expect(tradeName([artifact], [paper(), pen(2)], IDS)).toBe('Transcribe and Trade');
  });

  it('is a Trade without an Artifact opposite a Paper and a Pen', () => {
    expect(tradeName([coin], [paper(), pen()], IDS)).toBe('Trade');
    expect(tradeName([artifact], [coin], IDS)).toBe('Trade');
    expect(tradeName([artifact], [paper()], IDS)).toBe('Trade');
    expect(tradeName([artifact], [paper(), pen()], null)).toBe('Trade');
  });

  it('reads mid-sentence and in the past tense', () => {
    expect(tradeNoun('Trade')).toBe('trade');
    expect(tradeNoun('Transcribe')).toBe('Transcribe');
    expect(tradeNamePast('Trade')).toBe('traded');
    expect(tradeNamePast('Transcribe')).toBe('transcribed');
    expect(tradeNamePast('Transcribe and Trade')).toBe('transcribed and traded');
  });
});

describe('the viewer\'s marks in the discoverers list', () => {
  it('reads a copy\'s number off its origin', () => {
    expect(copyMark('Oni#1')).toBe('#1');
    expect(copyMark('A#b#12')).toBe('#12');
    expect(copyMark(null)).toBeNull();
    expect(copyMark(undefined)).toBeNull();
    expect(copyMark('Oni')).toBeNull();
    expect(copyMark('Oni#')).toBeNull();
  });

  it('marks your own find', () => {
    expect(ledgerMarks({ ordinal: 4, origin: null, origin_ordinal: null })).toEqual([{ ordinal: 4, label: '(you)' }]);
  });

  it('marks the row a copy traces back to with its place under it: "#2 Oni #2"', () => {
    // Blimkin, transcribed from Skoober (Skoober#1), the 2nd under Oni.
    expect(ledgerMarks({ ordinal: null, origin: 'Skoober#1', origin_ordinal: 2, origin_order: 2 })).toEqual([
      { ordinal: 2, label: '#2' },
    ]);
  });

  it('falls back to the copy\'s own number from a backend without origin_order', () => {
    expect(ledgerMarks({ ordinal: null, origin: 'Oni#1', origin_ordinal: 2 })).toEqual([{ ordinal: 2, label: '#1' }]);
  });

  it('marks both for a copy holder who then found one', () => {
    expect(ledgerMarks({ ordinal: 5, origin: 'Oni#1', origin_ordinal: 2 })).toEqual([
      { ordinal: 5, label: '(you)' },
      { ordinal: 2, label: '#1' },
    ]);
  });

  it('marks nothing without an Artifact', () => {
    expect(ledgerMarks(null)).toEqual([]);
  });
});
