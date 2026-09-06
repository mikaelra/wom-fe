'use client';

/**
 * The My AI page (wom-be docs/MY_AI.md §9.2). Toggle the personal AI that
 * competes in bot ranked, tune its personality, and see the games it has
 * played. Reached from the profile dropdown (SceneTopBar), next to
 * Inventory and Settings.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getStoredAccountToken } from '@/lib/http';
import {
  getMyAiStatus,
  toggleMyAi,
  saveMyAiSettings,
  getMyAiMatches,
} from '@/lib/api';
import type {
  MyAiStatus,
  MyAiKnobs,
  MyAiActionSplit,
  MyAiOverrideRule,
  MyAiMatches,
} from '@/lib/schemas';
import { CITY_PATH } from '@/lib/cities';

const KNOBS: { key: Exclude<keyof MyAiKnobs, 'action_split'>; label: string; low: string; high: string }[] = [
  { key: 'greed', label: 'Greed', low: 'heals', high: 'hoards coin' },
  { key: 'revenge', label: 'Revenge', low: 'off', high: 'hits back' },
  { key: 'grudge', label: 'Grudge', low: 'off', high: 'Hit who hit me most' },
];

const ACTION_SPLIT_KEYS = ['attack', 'defend', 'well'] as const;
// As close to even as three ints summing to 100 get -- shown until the
// owner has ever touched a slider (nothing is saved until then).
const DEFAULT_ACTION_SPLIT: MyAiActionSplit = { attack: 34, defend: 33, well: 33 };

const RULE_CONDITIONS = ['hp_lte', 'hp_gte', 'round_lte', 'round_gte'] as const;
const RULE_ACTIONS = ['attack', 'defend', 'well', 'idle'] as const;
const RULE_RESOURCES = ['gain_hp', 'gain_coin', 'gain_attack', 'idle'] as const;
// Wire value -> label. `other` resolves to a random opponent.
const RULE_TARGETS: { v: string; l: string }[] = [
  { v: 'weakest', l: 'the weakest' },
  { v: 'strongest', l: 'the strongest' },
  { v: 'revenge', l: 'whoever hit me' },
  { v: 'most_aggressive', l: 'whoever attacks me most' },
  { v: 'least_aggressive', l: 'whoever attacks me least' },
  { v: 'other', l: 'a random player' },
];

/** "14:03" for a game that ended today, "Sep 1, 14:03" otherwise -- local
 *  clock. "—" if it doesn't parse. */
function formatEnded(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (new Date().toDateString() === d.toDateString()) return time;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function reasonText(reason: string): string {
  return (
    {
      queued: 'Your AI is on. It plays bot-ranked games while you\'re away.',
      no_credits: "No credits — your AI can't play. Finish a ranked or bot-ranked game, or buy a pack.",
      owner_idle: 'Your AI plays in the gaps between your own games.',
      already_queued: 'Your AI is already on.',
      toggled_off: 'Your AI is off.',
    }[reason] ?? reason
  );
}

export default function MyAiPage() {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<MyAiStatus | null>(null);
  const [matches, setMatches] = useState<MyAiMatches | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toggleNote, setToggleNote] = useState('');
  const [savedNote, setSavedNote] = useState('');

  // local draft of the tunables
  const [minuteCounter, setMinuteCounter] = useState(10);
  const [knobs, setKnobs] = useState<MyAiKnobs>({});
  const [rules, setRules] = useState<MyAiOverrideRule[]>([]);

  const refresh = useCallback((t: string) => {
    getMyAiStatus(t)
      .then((s) => {
        setStatus(s);
        setMinuteCounter(s.minute_counter);
        setKnobs(s.knobs);
        setRules(s.override_rules);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Failed to load your AI.'));
    getMyAiMatches(t).then(setMatches).catch(() => {});
  }, []);

  useEffect(() => {
    setMounted(true);
    const t = getStoredAccountToken();
    setToken(t);
    if (t) refresh(t);
  }, [refresh]);

  if (!mounted) return null;

  if (!token) {
    return (
      <Shell>
        <p className="text-white/80">
          You need a verified account to train an AI.{' '}
          <Link href={CITY_PATH} className="underline text-blue-300">Back to the city</Link>
        </p>
      </Shell>
    );
  }

  const onToggle = async () => {
    if (!status) return;
    setBusy(true);
    setToggleNote('');
    try {
      const res = await toggleMyAi(token, !status.enabled);
      setToggleNote(reasonText(res.reason));
      refresh(token);
    } catch (e) {
      setToggleNote(e instanceof Error ? e.message : 'Failed to toggle.');
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    setBusy(true);
    setSavedNote('');
    try {
      await saveMyAiSettings(token, {
        minute_counter: minuteCounter,
        knobs,
        override_rules: rules,
      });
      setSavedNote('Saved.');
      refresh(token);
    } catch (e) {
      setSavedNote(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      {loadError && <p className="text-red-400 mb-4">{loadError}</p>}
      {!status ? (
        <p className="text-white/60">Loading…</p>
      ) : (
        <div className="space-y-8">
          {/* --- toggle + credits + rank --- */}
          <section className="flex flex-wrap gap-6 items-center">
            <button
              type="button"
              disabled={busy}
              onClick={onToggle}
              className={`px-5 py-2 rounded-lg font-semibold transition-colors ${
                status.enabled ? 'bg-green-700 hover:bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
              } text-white disabled:opacity-50`}
            >
              {status.enabled ? 'AI is ON' : 'AI is OFF'}
            </button>
            <div className="text-sm text-white/80">
              <div className="flex items-center gap-1.5">
                <span><b>{status.credits}</b> credits</span>
                <CreditInfo />
                <span aria-hidden>·</span>
                <Link href="/shop" className="underline text-blue-300">buy more</Link>
              </div>
              <div>
                Bot rank:{' '}
                <b>{status.bot_rank.tier ?? '—'}</b> ({status.bot_rank.games_played} games)
              </div>
            </div>
          </section>
          {toggleNote && <p className="text-white/70 text-sm -mt-4">{toggleNote}</p>}
          {status.enabled && status.queue.queued && (
            <p className="text-white/60 text-sm -mt-6">
              {status.queue.playing
                ? `Playing while you're away · ${status.queue.games_played ?? 0} game${
                    (status.queue.games_played ?? 0) === 1 ? '' : 's'
                  } this session`
                : 'Standing by — starts when you go idle'}
            </p>
          )}

          {!status.trainable && (
            <p className="text-amber-300 text-sm bg-amber-950/40 rounded-lg p-3">
              Your AI trains on the ranked and bot-ranked games you play yourself.{' '}
              {status.logged_rows} of ~{status.min_rows} rounds logged so far — until then it
              plays like the average player.
            </p>
          )}

          {/* --- pace --- */}
          <section>
            <h2 className="text-white font-semibold mb-2">Pace</h2>
            <label className="text-sm text-white/80 flex items-center gap-3">
              While you&apos;re away, play a game every
              <input
                type="number"
                min={1}
                max={60}
                value={minuteCounter}
                onChange={(e) => setMinuteCounter(Number(e.target.value))}
                className="w-16 bg-gray-800 border border-white/20 rounded px-2 py-1 text-white"
              />
              minutes
            </label>
          </section>

          {/* --- knobs --- */}
          <section>
            <h2 className="text-white font-semibold mb-3">Personality</h2>
            <div className="max-w-md mb-5 pb-5 border-b border-white/10">
              <div className="flex justify-between text-xs text-white/60">
                <span>trained AI</span>
                <span className="text-white/90 font-medium">Influence</span>
                <span>full tuning</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={knobs.influence ?? 100}
                onChange={(e) => setKnobs((prev) => ({ ...prev, influence: Number(e.target.value) }))}
                className="w-full"
              />
              <p className="text-white/40 text-xs mt-1">
                How much of the sliders below actually reach your AI&apos;s decisions —
                0 plays exactly as trained, ignoring every slider; 100 is full strength.
              </p>
            </div>
            <div className="space-y-4 max-w-md">
              {KNOBS.map((k) => (
                <div key={k.key}>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>{k.low}</span>
                    <span className="text-white/90 font-medium">{k.label}</span>
                    <span>{k.high}</span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.1}
                    value={knobs[k.key] ?? 0}
                    onChange={(e) => setKnobs((prev) => ({ ...prev, [k.key]: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
            <div className="max-w-md mt-5">
              <h3 className="text-white/90 font-medium text-sm mb-2">Action split</h3>
              <ActionSplitSliders
                value={knobs.action_split}
                onChange={(next) => setKnobs((prev) => ({ ...prev, action_split: next }))}
              />
            </div>
          </section>

          {/* --- override rules --- */}
          <section>
            <h2 className="text-white font-semibold mb-2">Hard rules</h2>
            <p className="text-white/50 text-xs mb-3">
              Checked before the AI decides — the first rule that fits wins.
            </p>
            <div className="space-y-2">
              {rules.map((rule, i) => (
                <RuleRow
                  key={i}
                  rule={rule}
                  onChange={(next) => setRules((rs) => rs.map((r, j) => (j === i ? next : r)))}
                  onRemove={() => setRules((rs) => rs.filter((_, j) => j !== i))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setRules((rs) => [
                  ...rs,
                  { when: { hp_lte: 3 }, do: { action: 'defend', resource: 'gain_hp', target: null } },
                ])
              }
              className="mt-2 text-sm text-blue-300 underline"
            >
              + add rule
            </button>
          </section>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onSave}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-semibold disabled:opacity-50"
            >
              Save
            </button>
            {savedNote && <span className="text-white/60 text-sm">{savedNote}</span>}
          </div>

          {/* --- match history --- */}
          <section>
            <h2 className="text-white font-semibold mb-2">Recent bot-ranked games</h2>
            {!matches || matches.matches.length === 0 ? (
              <p className="text-white/50 text-sm">No games yet.</p>
            ) : (
              <table className="text-sm text-white/80 w-full max-w-lg">
                <thead className="text-white/50 text-xs">
                  <tr>
                    <th className="text-left">Placed</th>
                    <th className="text-left">Rank after</th>
                    <th className="text-left">Opponents</th>
                    <th className="text-right">Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.matches.map((m) => (
                    <tr key={m.match_id} className="border-t border-white/10">
                      <td>#{m.placement}</td>
                      <td>{m.rank ?? '—'}</td>
                      <td>{m.opponents.map((o) => o.name).join(', ')}</td>
                      <td className="text-right text-white/50 whitespace-nowrap">
                        {m.at ? formatEnded(m.at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}

/** The little ⓘ next to the credit count: a click opens a plain-language
 *  note on where credits come from. Closes on outside-click or Escape. */
function CreditInfo() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label="How credits work"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-4 h-4 rounded-full border border-white/40 text-white/70 text-[10px] leading-none flex items-center justify-center hover:bg-white/10 hover:text-white transition-colors"
      >
        i
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-6 z-20 w-64 rounded-lg border border-white/15 bg-gray-900 p-3 text-xs text-white/80 shadow-xl"
        >
          <p className="font-semibold text-white mb-1">Bot-game credits</p>
          <p className="mb-1.5">Your AI spends one credit per game it plays on its own.</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>
              <b>Earn</b> one every time you finish a <b>ranked</b> or{' '}
              <b>bot-ranked</b> game yourself — those games also train your AI.
            </li>
            <li>
              <b>Buy</b> a pack of 10 in the{' '}
              <Link href="/shop" className="underline text-blue-300">shop</Link>.
            </li>
          </ul>
        </div>
      )}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 sm:p-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          {/* Home, and beside it the city. Kept as one item so a justify-between parent cannot fling them apart. */}
          <span className="emoji-pair inline-flex items-center gap-2">
            <Link
              href="/"
              className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-lg font-semibold hover:bg-white/20 transition-colors no-underline"
              aria-label="Back to Home"
            >
              🌍
            </Link>
            <Link
              href={CITY_PATH}
              className="bg-white/10 backdrop-blur-sm border border-white/20 text-white px-3 py-2 rounded-lg text-lg font-semibold hover:bg-white/20 transition-colors no-underline"
              aria-label="Go to the city"
            >
              🏛️
            </Link>
          </span>
          <h1 className="text-2xl font-bold">My AI</h1>
        </div>
        {children}
      </div>
    </main>
  );
}

function RuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: MyAiOverrideRule;
  onChange: (r: MyAiOverrideRule) => void;
  onRemove: () => void;
}) {
  const condKey = Object.keys(rule.when)[0] ?? 'hp_lte';
  const condVal = Number(rule.when[condKey] ?? 0);
  return (
    <div className="flex flex-wrap items-center gap-2 bg-gray-900 rounded-lg p-2 text-sm">
      <span className="text-white/50">when</span>
      <select
        value={condKey}
        onChange={(e) => onChange({ ...rule, when: { [e.target.value]: condVal } })}
        className="bg-gray-800 border border-white/20 rounded px-1 py-0.5"
      >
        {RULE_CONDITIONS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <input
        type="number"
        value={condVal}
        onChange={(e) => onChange({ ...rule, when: { [condKey]: Number(e.target.value) } })}
        className="w-14 bg-gray-800 border border-white/20 rounded px-1 py-0.5"
      />
      <span className="text-white/50">do</span>
      <select
        value={rule.do.action}
        onChange={(e) => {
          const action = e.target.value as MyAiOverrideRule['do']['action'];
          onChange({
            ...rule,
            do: {
              ...rule.do,
              action,
              // a target only means anything for an attack rule
              target: action === 'attack' ? (rule.do.target ?? 'weakest') : null,
            },
          });
        }}
        className="bg-gray-800 border border-white/20 rounded px-1 py-0.5"
      >
        {RULE_ACTIONS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
      {rule.do.action === 'attack' && (
        <select
          value={rule.do.target ?? 'weakest'}
          onChange={(e) => onChange({ ...rule, do: { ...rule.do, target: e.target.value } })}
          className="bg-gray-800 border border-white/20 rounded px-1 py-0.5"
        >
          {RULE_TARGETS.map((t) => (
            <option key={t.v} value={t.v}>{t.l}</option>
          ))}
        </select>
      )}
      <select
        value={rule.do.resource}
        onChange={(e) => onChange({ ...rule, do: { ...rule.do, resource: e.target.value } })}
        className="bg-gray-800 border border-white/20 rounded px-1 py-0.5"
      >
        {RULE_RESOURCES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <button type="button" onClick={onRemove} className="text-red-400 ml-auto">✕</button>
    </div>
  );
}

/**
 * A 3-way percentage split (attack/defend/well) that always sums to 100 --
 * "spend X% of rounds attacking, Y% defending, Z% at the well" (per
 * Mikael: "you distribute 1-100 on each of those and then they have to
 * add up to 100 ... whenever you alter a new one, the last one you
 * altered ... gets lowered/highered according to the new adjustment").
 *
 * Dragging one slider takes its whole delta from whichever OTHER slider
 * was most recently touched (clamped to 0..100); if that one can't
 * absorb it all, the remainder spills to the third, least-recently-
 * touched slider. The touch order itself is UI-only (never saved) --
 * `recency` just remembers which of the two others "goes first".
 */
function ActionSplitSliders({
  value, onChange,
}: {
  value: MyAiActionSplit | undefined;
  onChange: (next: MyAiActionSplit) => void;
}) {
  const split = value ?? DEFAULT_ACTION_SPLIT;
  const recency = useRef<(typeof ACTION_SPLIT_KEYS)[number][]>([...ACTION_SPLIT_KEYS]);

  const handleChange = (key: (typeof ACTION_SPLIT_KEYS)[number], raw: number) => {
    const clampedKey = Math.max(0, Math.min(100, Math.round(raw)));
    const delta = clampedKey - split[key];
    if (delta === 0) return;

    const others = ACTION_SPLIT_KEYS.filter((k) => k !== key);
    const partner = recency.current.find((k) => (others as readonly string[]).includes(k)) ?? others[0];
    const third = others.find((k) => k !== partner) ?? others[1];

    // partner absorbs as much of the delta as it can (clamped)...
    const partnerNew = Math.max(0, Math.min(100, split[partner] - delta));
    const usedByPartner = split[partner] - partnerNew;
    // ...third takes whatever's left (also clamped)...
    const remainder = delta - usedByPartner;
    const thirdNew = Math.max(0, Math.min(100, split[third] - remainder));
    const usedByThird = split[third] - thirdNew;
    // ...and on the rare double-clamp, the key itself gives back the
    // sliver neither could absorb, so the total always stays exactly 100.
    const keyNew = clampedKey - (remainder - usedByThird);

    recency.current = [key, partner, third];
    onChange({ ...split, [key]: keyNew, [partner]: partnerNew, [third]: thirdNew });
  };

  return (
    <div className="space-y-3">
      {ACTION_SPLIT_KEYS.map((k) => (
        <div key={k}>
          <div className="flex justify-between text-xs text-white/60">
            <span className="text-white/90 font-medium capitalize">{k}</span>
            <span>{split[k]}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={split[k]}
            onChange={(e) => handleChange(k, Number(e.target.value))}
            className="w-full"
          />
        </div>
      ))}
      <p className="text-white/40 text-xs">Always adds up to 100%.</p>
    </div>
  );
}
