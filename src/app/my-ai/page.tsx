'use client';

/**
 * The My AI page (wom-be docs/MY_AI.md §9.2). Toggle the personal AI that
 * competes in bot ranked, tune its personality, and see the games it has
 * played. Reached from the profile dropdown (SceneTopBar), next to
 * Inventory and Settings.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getStoredAccountToken } from '@/lib/http';
import {
  getMyAiStatus,
  toggleMyAi,
  saveMyAiSettings,
  getMyAiPersonality,
  getMyAiMatches,
} from '@/lib/api';
import type {
  MyAiStatus,
  MyAiKnobs,
  MyAiOverrideRule,
  MyAiPersonality,
  MyAiMatches,
} from '@/lib/schemas';
import { CITY_PATH } from '@/lib/cities';

const KNOBS: { key: keyof MyAiKnobs; label: string; low: string; high: string }[] = [
  { key: 'aggression', label: 'Aggression', low: 'passive', high: 'attacks' },
  { key: 'turtle', label: 'Turtle', low: 'off', high: 'defends' },
  { key: 'greed', label: 'Greed', low: 'heals', high: 'hoards coin' },
  { key: 'vengeance', label: 'Vengeance', low: 'off', high: 'hits back' },
];

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
      no_credits: "No credits — your AI can't play. Win a ranked game or buy a pack.",
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
  const [personality, setPersonality] = useState<MyAiPersonality | null>(null);
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
    getMyAiPersonality(t).then(setPersonality).catch(() => {});
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
              <div>
                <b>{status.credits}</b> credits ·{' '}
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
              Your AI trains on your ranked games. {status.logged_rows} of ~{status.min_rows} logged
              so far — until then it plays like the average player.
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

          {/* --- personality readout --- */}
          {personality?.trained && personality.deviations.length > 0 && (
            <section>
              <h2 className="text-white font-semibold mb-2">Where your AI differs</h2>
              <ul className="text-sm text-white/80 space-y-1">
                {personality.deviations.map((d, i) => (
                  <li key={i}>
                    {d.direction === 'more' ? '↑' : '↓'} {d.action} / {d.resource} — {d.feature}
                  </li>
                ))}
              </ul>
            </section>
          )}

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
                      <td>{m.opponents.map((o) => o.owner).join(', ')}</td>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 sm:p-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">My AI</h1>
          <Link href={CITY_PATH} className="text-sm text-white/60 underline">← City</Link>
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
