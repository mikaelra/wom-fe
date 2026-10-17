import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  postApplePrepare: vi.fn(),
  postAppleVerify: vi.fn(),
}));

import { postApplePrepare, postAppleVerify } from '@/lib/api';
import { ApiError } from '@/lib/http';
import {
  buyWithApple,
  deliver,
  deliverUnfinished,
  isIosApp,
  listenForTransactions,
  loadAppleShop,
  type SignedTransaction,
  type WomStoreKitPlugin,
} from '@/lib/appleShop';

const prepare = vi.mocked(postApplePrepare);
const verify = vi.mocked(postAppleVerify);

function fakePlugin(overrides: Partial<WomStoreKitPlugin> = {}) {
  const listeners: ((t: SignedTransaction) => void)[] = [];
  const plugin = {
    products: vi.fn(async ({ ids }: { ids: string[] }) => ({
      products: ids
        .filter((id) => !id.endsWith('.missing'))
        .map((id) => ({ id, displayName: id, displayPrice: `kr ${id.length}` })),
    })),
    purchase: vi.fn(async () => ({ status: 'purchased' as const, jws: 'jws-1', transactionId: '11' })),
    finish: vi.fn(async () => undefined),
    unfinished: vi.fn(async () => ({ transactions: [] as SignedTransaction[] })),
    storefront: vi.fn(async () => ({ countryCode: 'NOR' as string | null })),
    addListener: vi.fn(async (_event: 'transaction', listener: (t: SignedTransaction) => void) => {
      listeners.push(listener);
      return { remove: async () => undefined };
    }),
    ...overrides,
  };
  return { plugin: plugin as unknown as WomStoreKitPlugin, raw: plugin, listeners };
}

const PREPARED = {
  app_account_token: 'uuid-7',
  products: [
    { product: 'wheel_special', apple_product_id: 'net.wom.wheel_special', kind: 'wheel', max_quantity: 10 },
    { product: 'skin_cherub', apple_product_id: 'net.wom.missing', kind: 'skin', max_quantity: 1 },
  ],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('isIosApp', () => {
  it('is false outside the iOS app', () => {
    expect(isIosApp()).toBe(false);
  });
});

describe('loadAppleShop', () => {
  it('asks the backend for this storefront and prices from the App Store, leaving out unknown products', async () => {
    prepare.mockResolvedValue(PREPARED);
    const { plugin, raw } = fakePlugin();
    const shop = await loadAppleShop('tok', plugin);
    expect(prepare).toHaveBeenCalledWith('tok', 'NOR');
    expect(raw.products).toHaveBeenCalledWith({ ids: ['net.wom.wheel_special', 'net.wom.missing'] });
    expect(shop).toEqual({
      appAccountToken: 'uuid-7',
      products: [{
        product: 'wheel_special',
        appleProductId: 'net.wom.wheel_special',
        kind: 'wheel',
        maxQuantity: 10,
        displayPrice: 'kr 21',
      }],
    });
  });

  it('works without a known storefront', async () => {
    prepare.mockResolvedValue(PREPARED);
    const { plugin } = fakePlugin({ storefront: vi.fn(async () => ({ countryCode: null })) });
    await loadAppleShop('tok', plugin);
    expect(prepare).toHaveBeenCalledWith('tok', undefined);
  });
});

describe('deliver', () => {
  const t = { jws: 'jws-1', transactionId: '11' };

  it('finishes the transaction once the backend has granted it', async () => {
    verify.mockResolvedValue({ status: 'fulfilled', order_id: 1, product: 'wheel_special' });
    const { plugin, raw } = fakePlugin();
    expect(await deliver('tok', t, plugin)).toBe('fulfilled');
    expect(verify).toHaveBeenCalledWith('tok', 'jws-1');
    expect(raw.finish).toHaveBeenCalledWith({ transactionId: '11' });
  });

  it.each(['revoked', 'already_claimed'])('finishes it on a final refusal (%s)', async (code) => {
    verify.mockRejectedValue(new ApiError(409, 'no', code));
    const { plugin, raw } = fakePlugin();
    expect(await deliver('tok', t, plugin)).toBe('refused');
    expect(raw.finish).toHaveBeenCalled();
  });

  it.each([
    ['an account mismatch', new ApiError(403, 'other account', 'account_mismatch')],
    ['a network error', new Error('offline')],
  ])('keeps it for later on %s', async (_label, error) => {
    verify.mockRejectedValue(error);
    const { plugin, raw } = fakePlugin();
    expect(await deliver('tok', t, plugin)).toBe('retry');
    expect(raw.finish).not.toHaveBeenCalled();
  });
});

describe('buyWithApple', () => {
  const shop = { appAccountToken: 'uuid-7', products: [] };
  const product = { product: 'wheel_special', appleProductId: 'net.wom.wheel_special', kind: 'wheel', maxQuantity: 10, displayPrice: 'kr 49' };

  it('buys with the account token, within StoreKit quantity, and delivers it', async () => {
    verify.mockResolvedValue({ status: 'fulfilled', order_id: 1, product: 'wheel_special' });
    const { plugin, raw } = fakePlugin();
    expect(await buyWithApple('tok', shop, product, 25, plugin)).toBe('fulfilled');
    expect(raw.purchase).toHaveBeenCalledWith({ id: 'net.wom.wheel_special', quantity: 10, appAccountToken: 'uuid-7' });
  });

  it.each(['cancelled', 'pending'] as const)('passes on a %s purchase without delivering', async (status) => {
    const { plugin } = fakePlugin({ purchase: vi.fn(async () => ({ status })) });
    expect(await buyWithApple('tok', shop, product, 1, plugin)).toBe(status);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('deliverUnfinished', () => {
  it('delivers every queued transaction and counts the granted ones', async () => {
    verify
      .mockResolvedValueOnce({ status: 'fulfilled', order_id: 1, product: 'wheel_special' })
      .mockRejectedValueOnce(new Error('offline'));
    const { plugin } = fakePlugin({
      unfinished: vi.fn(async () => ({
        transactions: [{ jws: 'a', transactionId: '1' }, { jws: 'b', transactionId: '2' }],
      })),
    });
    expect(await deliverUnfinished('tok', plugin)).toBe(1);
    expect(verify).toHaveBeenCalledTimes(2);
  });
});

describe('listenForTransactions', () => {
  it('delivers what StoreKit reports while someone is logged in', async () => {
    verify.mockResolvedValue({ status: 'fulfilled', order_id: 1, product: 'wheel_special' });
    const { plugin, listeners } = fakePlugin();
    let token: string | null = null;
    await listenForTransactions(() => token, plugin);
    listeners[0]({ jws: 'x', transactionId: '3' });
    expect(verify).not.toHaveBeenCalled();
    token = 'tok';
    listeners[0]({ jws: 'x', transactionId: '3' });
    expect(verify).toHaveBeenCalledWith('tok', 'x');
  });
});
