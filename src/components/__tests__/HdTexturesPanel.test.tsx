import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ native: false, unlocked: true }));

vi.mock('@/lib/buildTarget', () => ({
  get IS_NATIVE_BUILD() { return state.native; },
}));
vi.mock('@/lib/hdTextures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hdTextures')>()),
  hdUnlocked: () => Promise.resolve(state.unlocked),
}));

import HdTexturesPanel from '@/components/settings/HdTexturesPanel';
import { getHdPreference } from '@/lib/hdTextures';
import { getTextMode } from '@/lib/textMode';

const option = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;

beforeEach(() => {
  Object.assign(state, { native: false, unlocked: true });
  localStorage.clear();
});

describe('HdTexturesPanel', () => {
  it('is one choice of Text, SD or HD, SD by default on the web', async () => {
    render(<HdTexturesPanel />);
    await screen.findByRole('radio', { name: 'HD' });
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(option('SD').checked).toBe(true);
    expect(option('Text').checked).toBe(false);
    expect(option('HD').checked).toBe(false);
  });

  it('remembers HD for a web account that has it', async () => {
    render(<HdTexturesPanel />);
    fireEvent.click(await screen.findByRole('radio', { name: 'HD' }));
    expect(option('HD').checked).toBe(true);
    expect(getHdPreference()).toBe(true);
    expect(getTextMode()).toBe(false);
    expect(
      screen.getByText('Load HD textures (41mb). Will start to load on entering earth or city scene.'),
    ).toBeTruthy();
  });

  it('offers only Text and SD on the web without HD, and says how to unlock it', async () => {
    state.unlocked = false;
    render(<HdTexturesPanel />);
    expect(await screen.findByText(/come with the game on Steam/)).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('radio', { name: 'HD' })).toBeNull();
  });

  it('switches to text mode and back to SD', async () => {
    render(<HdTexturesPanel />);
    await screen.findByRole('radio', { name: 'HD' });
    fireEvent.click(option('Text'));
    expect(getTextMode()).toBe(true);
    expect(option('Text').checked).toBe(true);
    fireEvent.click(option('SD'));
    expect(getTextMode()).toBe(false);
    expect(getHdPreference()).toBe(false);
    expect(option('SD').checked).toBe(true);
  });

  it('starts on HD in the paid apps, and can go to SD', () => {
    state.native = true;
    render(<HdTexturesPanel />);
    expect(option('HD').checked).toBe(true);
    expect(screen.getByText('Load HD textures.')).toBeTruthy();
    fireEvent.click(option('SD'));
    expect(getHdPreference()).toBe(false);
  });
});
