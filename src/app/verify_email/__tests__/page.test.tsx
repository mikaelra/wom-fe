import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import VerifyEmailPage from '@/app/verify_email/page';
import { confirmEmailVerification } from '@/lib/api';

let searchParams = new URLSearchParams();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

vi.mock('@/lib/api', () => ({
  confirmEmailVerification: vi.fn(),
}));

const showSuccess = vi.fn();
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ showSuccess, showError: vi.fn() }),
}));

const mockedConfirm = vi.mocked(confirmEmailVerification);
const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  mockedConfirm.mockReset();
  replace.mockClear();
  showSuccess.mockClear();
  searchParams = new URLSearchParams();
});

describe('VerifyEmailPage', () => {
  it('shows an error when the token is missing, without calling the API', async () => {
    render(<VerifyEmailPage />);
    await flush();

    expect(screen.getByText('Missing confirmation token.')).toBeInTheDocument();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('redirects home with an "Account verified" toast for a claim_name token', async () => {
    searchParams = new URLSearchParams({ token: 'tok' });
    mockedConfirm.mockResolvedValue({ success: true, purpose: 'claim_name' });
    render(<VerifyEmailPage />);
    await flush();

    expect(mockedConfirm).toHaveBeenCalledWith('tok');
    expect(showSuccess).toHaveBeenCalledWith('Account verified');
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('redirects home with a relic-claimed toast naming the relic for a claim_relic token', async () => {
    searchParams = new URLSearchParams({ token: 'tok' });
    mockedConfirm.mockResolvedValue({ success: true, purpose: 'claim_relic', relic_name: 'Golden Fleece' });
    render(<VerifyEmailPage />);
    await flush();

    expect(showSuccess).toHaveBeenCalledWith('Relic claimed: Golden Fleece');
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('redirects to the inventory with an artifact toast for a claim_artifact token', async () => {
    searchParams = new URLSearchParams({ token: 'tok' });
    mockedConfirm.mockResolvedValue({ success: true, purpose: 'claim_artifact' });
    render(<VerifyEmailPage />);
    await flush();

    expect(showSuccess).toHaveBeenCalledWith('Artifact claimed! Equip it in your inventory.');
    expect(replace).toHaveBeenCalledWith('/inventory');
  });

  it('still confirms success for a purpose this build does not recognise', async () => {
    // Regression lock. `purpose` used to be a closed enum, so the day wom-be
    // added 'claim_artifact' the response failed schema validation and this
    // page showed a red error -- for a claim the backend had already
    // completed: email verified, session issued, artifact granted. An
    // unknown purpose must degrade to the generic confirmation, never to a
    // failure.
    searchParams = new URLSearchParams({ token: 'tok' });
    mockedConfirm.mockResolvedValue({ success: true, purpose: 'claim_something_new' });
    render(<VerifyEmailPage />);
    await flush();

    expect(showSuccess).toHaveBeenCalledWith('Account verified');
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('shows the server error message on failure', async () => {
    searchParams = new URLSearchParams({ token: 'tok' });
    mockedConfirm.mockRejectedValue(new Error('Invalid or expired link.'));
    render(<VerifyEmailPage />);
    await flush();

    expect(screen.getByText('Invalid or expired link.')).toBeInTheDocument();
  });
});
