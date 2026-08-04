import { useCallback, useState } from 'react';
import { checkName, logInUser, verifyLoginCode } from '@/lib/api';

export interface UseAuthFlowOptions {
  /** Called once fully authenticated (name unclaimed, or login/code
   *  verification succeeded). May be async; the hook awaits it before
   *  clearing `loading`, so a caller whose follow-up action is itself
   *  async keeps its own loading indicator lit for the full duration. */
  onAuthenticated: (name: string, email: string) => void | Promise<void>;
  /** Shown when the name-check step throws a non-Error or generic failure.
   *  Only relevant to callers that use `handleSubmitName` -- optional since
   *  a plain-login caller (no `checkName` step) never reaches this path. */
  submitErrorFallback?: string;
}

const DEFAULT_SUBMIT_ERROR_FALLBACK = 'Something went wrong.';

// Mirrors wom-be's regex_name_check (helpers.py): 1-12 chars, no spaces or
// / \ @ " ' -. Catching this client-side, before the round trip, matters
// because a rejected name here doesn't fail loudly -- WorldMapOverlay.tsx's
// onAuthenticated already closes the name popup before its own doCreate/
// doJoin call resolves, so a bad name previously surfaced only as an
// easy-to-miss toast (or, for a caller with no toast at all, nothing
// visible whatsoever -- confirmed for real via wom-e2e's own
// turtle-fight-win.spec.ts: a 17-character name 400'd on POST
// /create_lobby with zero UI feedback, just a stuck popup).
export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 12;
const NAME_INVALID_CHARS = /[ \\/@"'-]/;

function validateName(name: string): string | null {
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    return `Name must be ${NAME_MIN_LENGTH}–${NAME_MAX_LENGTH} characters long`;
  }
  if (NAME_INVALID_CHARS.test(name)) {
    return `Name cannot contain spaces or special characters like / \\ @ " ' -`;
  }
  return null;
}

export interface UseAuthFlowResult {
  name: string;
  setName: (name: string) => void;
  error: string;
  loading: boolean;
  emailMode: boolean;
  email: string;
  setEmail: (email: string) => void;
  emailError: string;
  codeMode: boolean;
  code: string;
  setCode: (code: string) => void;
  codeError: string;
  handleSubmitName: () => void;
  handleLogin: () => void;
  handleVerifyCode: () => void;
  /** Drops back from the code step to the email step, without resetting name/email. */
  backToEmailStep: () => void;
  reset: () => void;
}

/**
 * The checkName -> claimed? -> logInUser -> requires_code? -> verifyLoginCode
 * flow, shared by the "single action, always checkName-gated" call sites
 * (the Athens raid popup, the lobby join form). Presentation-free: callers
 * own their own JSX and supply `onAuthenticated` for whatever should happen
 * once a name is confirmed usable.
 */
export function useAuthFlow({
  onAuthenticated,
  submitErrorFallback,
}: UseAuthFlowOptions): UseAuthFlowResult {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  const [codeMode, setCodeMode] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  const handleSubmitName = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a username.');
      return;
    }
    const nameError = validateName(trimmed);
    if (nameError) {
      setError(nameError);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { claimed } = await checkName(trimmed);
      if (claimed) {
        setEmailMode(true);
        setEmail('');
        setEmailError('');
        return;
      }
      await onAuthenticated(trimmed, '');
    } catch (e) {
      setError(e instanceof Error ? e.message : submitErrorFallback ?? DEFAULT_SUBMIT_ERROR_FALLBACK);
    } finally {
      setLoading(false);
    }
  }, [name, onAuthenticated, submitErrorFallback]);

  const handleLogin = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Please enter your email.');
      return;
    }
    setEmailError('');
    setLoading(true);
    try {
      const result = await logInUser(trimmedName, trimmedEmail);
      if (result.requires_code) {
        setCodeMode(true);
        setCode('');
        setCodeError('');
        return;
      }
      await onAuthenticated(trimmedName, trimmedEmail);
    } catch (e) {
      if (e instanceof Error && e.message === 'Wrong email') {
        setEmailError('Wrong email');
      } else {
        setEmailError(e instanceof Error ? e.message : 'Log in failed.');
      }
    } finally {
      setLoading(false);
    }
  }, [name, email, onAuthenticated]);

  const handleVerifyCode = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setCodeError('Please enter the code from your email.');
      return;
    }
    setCodeError('');
    setLoading(true);
    try {
      await verifyLoginCode(trimmedName, trimmedCode);
      await onAuthenticated(trimmedName, trimmedEmail);
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  }, [name, email, code, onAuthenticated]);

  const backToEmailStep = useCallback(() => {
    setCodeMode(false);
    setCode('');
    setCodeError('');
  }, []);

  const reset = useCallback(() => {
    setName('');
    setError('');
    setLoading(false);
    setEmailMode(false);
    setEmail('');
    setEmailError('');
    setCodeMode(false);
    setCode('');
    setCodeError('');
  }, []);

  return {
    name,
    setName,
    error,
    loading,
    emailMode,
    email,
    setEmail,
    emailError,
    codeMode,
    code,
    setCode,
    codeError,
    handleSubmitName,
    handleLogin,
    handleVerifyCode,
    backToEmailStep,
    reset,
  };
}
