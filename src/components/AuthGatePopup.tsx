'use client';

import { NAME_MAX_LENGTH, type UseAuthFlowResult } from '@/lib/useAuthFlow';

export type AuthGateAccent = 'red' | 'blue';

/**
 * Accent classes as COMPLETE literal strings, never interpolated.
 *
 * Tailwind's JIT scans source text for whole class names, so a template
 * like `border-${accent}-700/60` produces markup referencing a class that
 * was never emitted into the stylesheet -- the element silently renders
 * unstyled. Every variant that can appear at runtime has to be spelled out
 * somewhere the scanner can see it, which is exactly what this table is.
 */
const ACCENT: Record<AuthGateAccent, { card: string; title: string; field: string; action: string }> = {
  red: {
    card: 'border-red-700/60',
    title: 'text-red-400',
    field: 'border-red-700/50 focus:border-red-500',
    action: 'bg-red-700 hover:bg-red-600',
  },
  blue: {
    card: 'border-blue-700/60',
    title: 'text-blue-400',
    field: 'border-blue-700/50 focus:border-blue-500',
    action: 'bg-blue-700 hover:bg-blue-600',
  },
};

export interface AuthGatePopupProps {
  /** A `useAuthFlow` result. The popup is presentation only -- every state
   *  transition and every network call still lives in the hook, and the
   *  caller still owns `onAuthenticated`. */
  authFlow: UseAuthFlowResult;
  accent: AuthGateAccent;
  /** Heading, e.g. "Enter the Hades Bossfight". */
  title: string;
  /** One line under the heading explaining what the name is for. */
  blurb: string;
  /** Primary button on the name step, e.g. "Enter Bossfight". */
  submitLabel: string;
  /** Primary button on the name step while a request is in flight. */
  submitLoadingLabel: string;
  /** Backdrop click and the name step's Cancel button. */
  onClose: () => void;
}

const FIELD_BASE =
  'w-full p-2 rounded-md bg-gray-800 text-white placeholder-white/30 focus:outline-none border';
const ACTION_BASE =
  'flex-1 py-2 rounded-lg font-bold text-white transition-colors disabled:opacity-50 cursor-pointer';
const NEUTRAL_ACTION =
  'flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 font-bold text-white transition-colors disabled:opacity-50 cursor-pointer';

/**
 * The name -> email -> code gate shown before an action that needs a
 * confirmed player name (the Hades bossfight, the ranked queue).
 *
 * Extracted from two byte-for-byte-equivalent copies in `app/page.tsx`
 * that differed only in accent colour, copy, and the primary button's
 * label -- which are exactly this component's props. See
 * `docs/CITY_SCENE_PLAN.md` §8.1: both call sites are about to move into
 * the city scene, and moving one component is a reviewable diff in a way
 * that moving two near-identical 130-line JSX blocks is not.
 */
export default function AuthGatePopup({
  authFlow,
  accent,
  title,
  blurb,
  submitLabel,
  submitLoadingLabel,
  onClose,
}: AuthGatePopupProps) {
  const a = ACCENT[accent];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className={`bg-gray-900 border ${a.card} text-white p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={`text-xl font-bold mb-1 ${a.title}`}>{title}</h2>
        <p className="text-sm text-white/60 mb-4">{blurb}</p>

        <input
          type="text"
          maxLength={NAME_MAX_LENGTH}
          placeholder="Your battle name"
          value={authFlow.name}
          onChange={(e) => authFlow.setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (authFlow.codeMode) authFlow.handleVerifyCode();
            else if (authFlow.emailMode) authFlow.handleLogin();
            else authFlow.handleSubmitName();
          }}
          autoFocus
          readOnly={authFlow.emailMode}
          className={`${FIELD_BASE} ${a.field} mb-3 ${authFlow.emailMode ? 'opacity-70' : ''}`}
        />
        {authFlow.error && !authFlow.emailMode && (
          <p className="text-red-400 text-sm mb-3">{authFlow.error}</p>
        )}

        {authFlow.emailMode && (
          <>
            <p className="text-sm text-white/80 mb-2">
              This name is claimed. Type your email if you have claimed this username.
            </p>
            <input
              type="email"
              placeholder="email"
              value={authFlow.email}
              onChange={(e) => authFlow.setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !authFlow.codeMode) authFlow.handleLogin(); }}
              autoFocus={!authFlow.codeMode}
              readOnly={authFlow.codeMode}
              className={`${FIELD_BASE} ${a.field} mb-1 ${authFlow.codeMode ? 'opacity-70' : ''}`}
            />
            <p className="text-xs text-white/50 mb-3">email</p>
            {authFlow.emailError && !authFlow.codeMode && (
              <p className="text-red-500 text-sm mb-3 font-semibold">{authFlow.emailError}</p>
            )}
          </>
        )}

        {authFlow.codeMode && (
          <>
            <p className="text-sm text-white/80 mb-2">
              We sent a 6-digit code to <strong>{authFlow.email}</strong>.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              value={authFlow.code}
              onChange={(e) => authFlow.setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && authFlow.handleVerifyCode()}
              autoFocus
              className={`${FIELD_BASE} ${a.field} tracking-[0.3em] font-mono text-center mb-3`}
            />
            {authFlow.codeError && (
              <p className="text-red-500 text-sm mb-3 font-semibold">{authFlow.codeError}</p>
            )}
          </>
        )}

        <div className="flex gap-3">
          {authFlow.codeMode ? (
            <>
              <button
                type="button"
                onClick={authFlow.handleVerifyCode}
                disabled={authFlow.loading}
                className={`${ACTION_BASE} ${a.action}`}
              >
                {authFlow.loading ? 'Verifying...' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={authFlow.backToEmailStep}
                disabled={authFlow.loading}
                className={NEUTRAL_ACTION}
              >
                Back
              </button>
            </>
          ) : authFlow.emailMode ? (
            <>
              <button
                type="button"
                onClick={authFlow.handleLogin}
                disabled={authFlow.loading}
                className={`${ACTION_BASE} ${a.action}`}
              >
                {authFlow.loading ? 'Logging in...' : 'Log in'}
              </button>
              <button
                type="button"
                onClick={authFlow.reset}
                disabled={authFlow.loading}
                className={NEUTRAL_ACTION}
              >
                Choose new name
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={authFlow.handleSubmitName}
                disabled={authFlow.loading}
                className={`${ACTION_BASE} ${a.action}`}
              >
                {authFlow.loading ? submitLoadingLabel : submitLabel}
              </button>
              {/* The two originals disagreed here: the ranked copy disabled
                  Cancel while a request was in flight, the Athens copy did
                  not. Unified on the ranked behaviour -- the single
                  deliberate behaviour change in this extraction. Closing
                  the Athens popup mid-flight never cancelled the in-flight
                  checkName, so the request could still resolve and navigate
                  the player into the bossfight they had just backed out of. */}
              <button
                type="button"
                onClick={onClose}
                disabled={authFlow.loading}
                className={NEUTRAL_ACTION}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
