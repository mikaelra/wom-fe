import { describe, expect, it, vi } from 'vitest';
import { watchContextLoss } from '@/lib/webglRecovery';

describe('watchContextLoss', () => {
  it('keeps a lost context restorable, and acts once it is restored', () => {
    const canvas = new EventTarget();
    const restored = vi.fn();
    const unwatch = watchContextLoss(canvas, restored);
    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(restored).not.toHaveBeenCalled();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(restored).toHaveBeenCalledTimes(1);
    unwatch();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(restored).toHaveBeenCalledTimes(1);
  });

  it('reloads the page by default', async () => {
    vi.resetModules();
    const reloadPage = vi.fn();
    vi.doMock('@/lib/reloadPage', () => ({ reloadPage }));
    const { watchContextLoss: watch } = await import('@/lib/webglRecovery');
    const canvas = new EventTarget();
    watch(canvas);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(reloadPage).toHaveBeenCalledTimes(1);
    vi.doUnmock('@/lib/reloadPage');
  });
});
