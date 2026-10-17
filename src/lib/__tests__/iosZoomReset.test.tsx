import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installIosZoomReset, isIosDevice, ZOOM_RESET_MS } from '@/lib/iosZoomReset';

const VIEWPORT = 'width=device-width, initial-scale=1, viewport-fit=cover';

describe('isIosDevice', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 0, true],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 5, true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5, true], // iPadOS
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0, false], // a real Mac
    ['Mozilla/5.0 (Linux; Android 14)', 5, false],
  ])('%s with %i touch points -> %s', (userAgent, maxTouchPoints, expected) => {
    expect(isIosDevice({ userAgent, maxTouchPoints })).toBe(expected);
  });
});

describe('installIosZoomReset', () => {
  let meta: HTMLMetaElement;
  let input: HTMLInputElement;
  let other: HTMLInputElement;
  let button: HTMLButtonElement;
  let uninstall: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = VIEWPORT;
    document.head.appendChild(meta);
    input = document.createElement('input');
    other = document.createElement('input');
    button = document.createElement('button');
    document.body.append(input, other, button);
    uninstall = installIosZoomReset(document);
  });

  afterEach(() => {
    uninstall();
    meta.remove();
    input.remove();
    other.remove();
    button.remove();
    vi.useRealTimers();
  });

  const blur = (target: Element, relatedTarget: Element | null) =>
    target.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));

  it('clamps the zoom when typing ends, then restores the viewport', () => {
    blur(input, button);
    expect(meta.content).toBe(`${VIEWPORT}, maximum-scale=1`);
    vi.advanceTimersByTime(ZOOM_RESET_MS);
    expect(meta.content).toBe(VIEWPORT);
  });

  it('leaves the zoom alone when focus moves on to another field', () => {
    blur(input, other);
    expect(meta.content).toBe(VIEWPORT);
  });

  it('ignores blurs of things that are not text fields', () => {
    blur(button, null);
    expect(meta.content).toBe(VIEWPORT);
  });

  it('does not stack clamps on a quick second blur', () => {
    blur(input, null);
    blur(other, null);
    vi.advanceTimersByTime(ZOOM_RESET_MS);
    expect(meta.content).toBe(VIEWPORT);
  });

  it('stops listening, and restores nothing late, once uninstalled', () => {
    uninstall();
    blur(input, null);
    expect(meta.content).toBe(VIEWPORT);
  });

  it('does nothing without a viewport meta tag', () => {
    meta.remove();
    expect(() => blur(input, null)).not.toThrow();
  });
});
