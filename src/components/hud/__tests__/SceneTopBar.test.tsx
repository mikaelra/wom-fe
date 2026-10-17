import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import SceneTopBar from '@/components/hud/SceneTopBar';
import { getInventory, logOut } from '@/lib/api';
import { setStoredAccountToken } from '@/lib/http';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  getInventory: vi.fn(),
  logOut: vi.fn(),
}));

const mockedGetInventory = vi.mocked(getInventory);
const mockedLogOut = vi.mocked(logOut);

const inventory = (equipped_skin = 'frog_pink_v1') => ({
  equipped_skin, skins: [], wheels: [],
});

beforeEach(() => {
  mockedGetInventory.mockReset();
  mockedLogOut.mockReset();
  mockedLogOut.mockResolvedValue({ success: true });
  localStorage.setItem('playerName', 'Alice');
  setStoredAccountToken('acct-tok');
});

afterEach(() => {
  localStorage.clear();
  setStoredAccountToken(null);
});

/** The avatar chip: the blinking-green placeholder while loading has no
 *  <img> inside it; the real thumbnail (bug list 260916) does. */
function avatarSpan(container: HTMLElement): HTMLElement {
  return container.querySelector('span.w-7.h-7') as HTMLElement;
}

describe('SceneTopBar avatar loading placeholder', () => {
  it('shows only the blinking-green placeholder while the equipped skin loads, never a specific skin', async () => {
    // The name-load effect re-fires getInventory once loggedInName settles
    // from '' to 'Alice' on the very next commit, so this must stay
    // pending across however many calls that produces, not just the first.
    let resolveInventory: (v: ReturnType<typeof inventory>) => void;
    const pending = new Promise<ReturnType<typeof inventory>>((resolve) => { resolveInventory = resolve; });
    mockedGetInventory.mockImplementation(() => pending);
    const { container } = render(<SceneTopBar />);
    await screen.findByText('Alice');

    const span = avatarSpan(container);
    expect(span.className).toContain('avatar-loading-blink');
    expect(span.querySelector('img')).toBeNull();

    await act(async () => {
      resolveInventory!(inventory('frog_pink_v1'));
    });

    await waitFor(() => expect(avatarSpan(container).className).not.toContain('avatar-loading-blink'));
    expect(avatarSpan(container).querySelector('img')).not.toBeNull();
  });

  it('stops blinking and shows no avatar if the fetch fails', async () => {
    mockedGetInventory.mockRejectedValue(new Error('offline'));
    const { container } = render(<SceneTopBar />);
    await screen.findByText('Alice');

    await waitFor(() => expect(mockedGetInventory).toHaveBeenCalled());
    await waitFor(() => expect(avatarSpan(container)).toBeNull());
  });

  it('shows no avatar at all -- no endless blink -- for a chosen name without a verified account', async () => {
    setStoredAccountToken(null);
    const { container } = render(<SceneTopBar />);
    await screen.findByText('Alice');

    expect(avatarSpan(container)).toBeNull();
    expect(container.querySelector('.avatar-loading-blink')).toBeNull();
    expect(mockedGetInventory).not.toHaveBeenCalled();
  });
});

describe('SceneTopBar belowRules', () => {
  it('draws what it is given directly under the Rules button', async () => {
    mockedGetInventory.mockResolvedValue(inventory());
    render(<SceneTopBar belowRules={<div data-testid="clock">12:00</div>} />);

    const clock = await screen.findByTestId('clock');
    const rules = screen.getByRole('button', { name: 'Rules' });
    expect(rules.nextElementSibling).toBe(clock);
  });

  it('draws nothing extra without it', async () => {
    mockedGetInventory.mockResolvedValue(inventory());
    render(<SceneTopBar />);
    await screen.findByRole('button', { name: 'Rules' });
    expect(screen.queryByTestId('clock')).not.toBeInTheDocument();
  });
});
