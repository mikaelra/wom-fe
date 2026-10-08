'use client';

import { useEffect, useState } from 'react';
import { connectWeb, getConnections } from '@/lib/api';
import { getStoredAccountToken } from '@/lib/http';

// Settings -> Connections: the ways into this account (wom-be
// routes/account.py /account/connections), one row each. Steam is the Steam
// account the Steam build logs in with; Web is email login, which the web
// version and the iOS app use. An account made on Steam has no email, so its
// Web row asks for one: the backend emails a link, and opening it in a
// browser adds the email and logs that browser in. A later device type is
// one more row. Shows nothing without a logged-in account.

type Connections = Awaited<ReturnType<typeof getConnections>>;

const button =
  'px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3">
      <span className="font-semibold shrink-0">{label}</span>
      <div className="text-right text-white/80 min-w-0">{children}</div>
    </li>
  );
}

export default function ConnectionsPanel() {
  const [token, setToken] = useState<string | null>(null);
  const [connections, setConnections] = useState<Connections | null>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const t = getStoredAccountToken();
    setToken(t);
    if (!t) return;
    getConnections(t)
      .then(setConnections)
      .catch(() => undefined); // an expired session: nothing to show
  }, []);

  if (!token || !connections) return null;

  const send = async () => {
    setSending(true);
    setError('');
    try {
      await connectWeb(token, email.trim());
      setSentTo(email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the email.');
    } finally {
      setSending(false);
    }
  };

  const { steam, web } = connections;

  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-6 mt-6">
      <h2 className="text-base font-semibold">Connections</h2>
      <ul className="mt-3 space-y-3">
        <Row label="Steam">{steam ? <span className="break-all">✓ {steam.name || 'Connected'}</span> : 'Not connected'}</Row>
        <Row label="Web">
          {web ? (
            <span className="break-all">✓ {web.email}</span>
          ) : sentTo ? (
            <span className="text-sm">Open the link sent to {sentTo} in your browser to play on the web.</span>
          ) : (
            <form
              className="flex flex-col items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim() && !sending) send();
              }}
            >
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  aria-label="Email"
                  className="w-44 px-2 py-1 rounded-lg bg-black/50 border border-white/20 text-white text-sm"
                />
                <button type="submit" disabled={sending || !email.trim()} className={button}>
                  {sending ? 'Sending…' : 'Connect'}
                </button>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </form>
          )}
        </Row>
      </ul>
    </div>
  );
}
