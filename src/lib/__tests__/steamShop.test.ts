import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  postSteamInit: vi.fn(),
  postSteamFinalize: vi.fn(),
  postSteamCheck: vi.fn(),
}));

import { postSteamCheck, postSteamFinalize, postSteamInit } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { buyWithSteam } from '@/lib/steamShop';

const init = vi.mocked(postSteamInit);
const finalize = vi.mocked(postSteamFinalize);
const check = vi.mocked(postSteamCheck);

type Answer = { orderId: string; authorized: boolean };

/** A fake Steam shell; `answer` plays the player's reply to Steam's dialog. */
function fakeShell() {
  let listener: ((a: Answer) => void) | null = null;
  const unsubscribe = vi.fn(() => {
    listener = null;
  });
  const w = {
    wom: {
      isSteam: true as const,
      getSteamInfo: vi.fn(),
      getSteamTicket: vi.fn(),
      quit: vi.fn(),
      onSteamPurchaseAnswer: vi.fn((l: (a: Answer) => void) => {
        listener = l;
        return unsubscribe;
      }),
    },
  };
  return { w, unsubscribe, answer: (a: Answer) => listener?.(a) };
}

/** Let pending promise callbacks run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('buyWithSteam', () => {
  it('passes an approval on and reports the item delivered', async () => {
    const shell = fakeShell();
    init.mockResolvedValue({ order_id: 42 });
    finalize.mockResolvedValue({ status: 'fulfilled', product: 'wheel_special' });

    const buying = buyWithSteam('tok', 'wheel_special', 3, false, shell.w);
    await flush();
    shell.answer({ orderId: '41', authorized: true }); // someone else's order: ignored
    shell.answer({ orderId: '42', authorized: true });

    await expect(buying).resolves.toBe('fulfilled');
    expect(init).toHaveBeenCalledWith('tok', 'wheel_special', 3, false, expect.any(String));
    expect(finalize).toHaveBeenCalledWith('tok', 42, true);
    expect(shell.unsubscribe).toHaveBeenCalled();
  });

  it('passes a decline on and reports it cancelled', async () => {
    const shell = fakeShell();
    init.mockResolvedValue({ order_id: 7 });
    finalize.mockResolvedValue({ status: 'cancelled', product: 'ai_credits' });

    const buying = buyWithSteam('tok', 'ai_credits', 1, false, shell.w);
    await flush();
    shell.answer({ orderId: '7', authorized: false });

    await expect(buying).resolves.toBe('cancelled');
    expect(finalize).toHaveBeenCalledWith('tok', 7, false);
  });

  it('catches an answer that arrives before the backend replies', async () => {
    const shell = fakeShell();
    init.mockImplementation(async () => {
      shell.answer({ orderId: '9', authorized: true });
      return { order_id: 9 };
    });
    finalize.mockResolvedValue({ status: 'fulfilled', product: 'skin_cherub' });

    await expect(buyWithSteam('tok', 'skin_cherub', 1, true, shell.w)).resolves.toBe('fulfilled');
    expect(init).toHaveBeenCalledWith('tok', 'skin_cherub', 1, true, expect.any(String));
  });

  it('gives up without finalizing when no answer comes', async () => {
    const shell = fakeShell();
    init.mockResolvedValue({ order_id: 5 });

    await expect(buyWithSteam('tok', 'wheel_special', 1, false, shell.w, 10)).resolves.toBe('cancelled');
    expect(finalize).not.toHaveBeenCalled();
    expect(shell.unsubscribe).toHaveBeenCalled();
  });

  it('reports an approved purchase as on its way when the backend cannot finish it now', async () => {
    const shell = fakeShell();
    init.mockResolvedValue({ order_id: 3 });
    finalize.mockRejectedValue(new ApiError(502, 'Steam is not answering.', 'steam_unavailable'));

    const buying = buyWithSteam('tok', 'wheel_special', 1, false, shell.w);
    await flush();
    shell.answer({ orderId: '3', authorized: true });

    await expect(buying).resolves.toBe('retry');
  });

  it('throws a final refusal from finalize', async () => {
    const shell = fakeShell();
    init.mockResolvedValue({ order_id: 3 });
    finalize.mockRejectedValue(new ApiError(404, 'Order not found.'));

    const buying = buyWithSteam('tok', 'wheel_special', 1, false, shell.w);
    await flush();
    shell.answer({ orderId: '3', authorized: true });

    await expect(buying).rejects.toThrow('Order not found.');
  });

  it("throws the backend's refusal to start, and stops listening", async () => {
    const shell = fakeShell();
    init.mockRejectedValue(new ApiError(409, 'You already own this.', 'already_owned'));

    await expect(buyWithSteam('tok', 'skin_cherub', 1, false, shell.w)).rejects.toMatchObject({ code: 'already_owned' });
    expect(shell.unsubscribe).toHaveBeenCalled();
    expect(finalize).not.toHaveBeenCalled();
  });

  it('refuses outside the Steam client', async () => {
    await expect(buyWithSteam('tok', 'wheel_special', 1, false, {})).rejects.toThrow('Steam is not running.');
    expect(init).not.toHaveBeenCalled();
  });
});

/** A fake Linux shell: no overlay, so purchases open Steam's page instead. */
function fakeLinuxShell() {
  const shell = fakeShell();
  const open = vi.fn();
  return { ...shell, open, w: { wom: { ...shell.w.wom, openSteamPurchasePage: open } } };
}

const STEAM_URL = 'https://store.steampowered.com/checkout/approvetxn/77/';

describe('buyWithSteam on Linux (a web purchase, no overlay)', () => {
  it("opens Steam's page and asks until the purchase is delivered", async () => {
    const shell = fakeLinuxShell();
    init.mockResolvedValue({ order_id: 77, steam_url: STEAM_URL });
    check
      .mockResolvedValueOnce({ status: 'pending', product: 'wheel_special' })
      .mockResolvedValueOnce({ status: 'fulfilled', product: 'wheel_special' });

    await expect(buyWithSteam('tok', 'wheel_special', 2, false, shell.w, 1000, 1)).resolves.toBe('fulfilled');
    expect(init).toHaveBeenCalledWith('tok', 'wheel_special', 2, false, expect.any(String), true);
    expect(shell.open).toHaveBeenCalledWith(STEAM_URL);
    expect(check).toHaveBeenCalledTimes(2);
    expect(check).toHaveBeenCalledWith('tok', 77);
    expect(finalize).not.toHaveBeenCalled();
    expect(shell.w.wom.onSteamPurchaseAnswer).not.toHaveBeenCalled();
  });

  it('asks every few seconds, not in a tight loop', async () => {
    vi.useFakeTimers();
    const shell = fakeLinuxShell();
    init.mockResolvedValue({ order_id: 77, steam_url: STEAM_URL });
    check.mockResolvedValue({ status: 'pending', product: 'wheel_special' });

    void buyWithSteam('tok', 'wheel_special', 1, false, shell.w);
    await vi.advanceTimersByTimeAsync(2999);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('reports a declined or failed purchase as cancelled', async () => {
    const shell = fakeLinuxShell();
    init.mockResolvedValue({ order_id: 77, steam_url: STEAM_URL });
    check.mockResolvedValue({ status: 'cancelled', product: 'ai_credits' });

    await expect(buyWithSteam('tok', 'ai_credits', 1, false, shell.w, 1000, 1)).resolves.toBe('cancelled');
  });

  it('gives up after the timeout when the player never approves', async () => {
    vi.useFakeTimers();
    const shell = fakeLinuxShell();
    init.mockResolvedValue({ order_id: 77, steam_url: STEAM_URL });
    check.mockResolvedValue({ status: 'pending', product: 'wheel_special' });

    const buying = buyWithSteam('tok', 'wheel_special', 1, false, shell.w);
    const outcome = expect(buying).resolves.toBe('cancelled');
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await outcome;
    expect(check).toHaveBeenCalledTimes(100);
  });

  it('keeps asking through server errors, rate limits and lost connections', async () => {
    const shell = fakeLinuxShell();
    init.mockResolvedValue({ order_id: 77, steam_url: STEAM_URL });
    check
      .mockRejectedValueOnce(new ApiError(502, 'Bad gateway'))
      .mockRejectedValueOnce(new ApiError(429, 'Too many requests'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ status: 'fulfilled', product: 'skin_cherub' });

    await expect(buyWithSteam('tok', 'skin_cherub', 1, true, shell.w, 1000, 1)).resolves.toBe('fulfilled');
    expect(check).toHaveBeenCalledTimes(4);
  });

  it('throws a final refusal while asking', async () => {
    const shell = fakeLinuxShell();
    init.mockResolvedValue({ order_id: 77, steam_url: STEAM_URL });
    check.mockRejectedValue(new ApiError(404, 'Order not found.'));

    await expect(buyWithSteam('tok', 'wheel_special', 1, false, shell.w, 1000, 1)).rejects.toThrow('Order not found.');
  });

  it("throws the backend's refusal to start without opening anything", async () => {
    const shell = fakeLinuxShell();
    init.mockRejectedValue(new ApiError(403, 'Not available in your region.', 'region_blocked'));

    await expect(buyWithSteam('tok', 'wheel_special', 1, false, shell.w)).rejects.toMatchObject({ code: 'region_blocked' });
    expect(shell.open).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });

  it('throws when the backend starts it without a Steam page', async () => {
    const shell = fakeLinuxShell();
    init.mockResolvedValue({ order_id: 77 });

    await expect(buyWithSteam('tok', 'wheel_special', 1, false, shell.w)).rejects.toThrow('Steam could not start the purchase.');
    expect(shell.open).not.toHaveBeenCalled();
  });
});
