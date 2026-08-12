import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import LegacyLobbyRedirect from '@/app/lobby/[lobbyId]/LegacyLobbyRedirect';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  replace.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LegacyLobbyRedirect', () => {
  it('redirects an old-shape share link to the new ?id= shape', async () => {
    render(<LegacyLobbyRedirect lobbyId="zzzz" />);
    await flush();

    expect(replace).toHaveBeenCalledWith('/lobby?id=zzzz');
  });

  it('falls back to the bare lobby page when there is no lobbyId', async () => {
    render(<LegacyLobbyRedirect lobbyId={undefined} />);
    await flush();

    expect(replace).toHaveBeenCalledWith('/lobby');
  });
});
