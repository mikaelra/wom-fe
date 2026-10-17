import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CameraSpeedButton from '@/components/hud/CameraSpeedButton';
import { getCameraSpeed, setCameraSpeed } from '@/lib/cameraSpeed';

beforeEach(() => localStorage.clear());

describe('CameraSpeedButton', () => {
  it('starts at 1x and offers 1x, 2x, 4x and 8x', () => {
    render(<CameraSpeedButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Camera speed: 1x' }));
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['1x', '2x', '4x', '8x']);
    expect(screen.getByRole('radio', { name: '1x' }).getAttribute('aria-checked')).toBe('true');
  });

  it('remembers the choice and shows it at once', () => {
    render(<CameraSpeedButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Camera speed: 1x' }));
    fireEvent.click(screen.getByRole('radio', { name: '4x' }));
    expect(getCameraSpeed()).toBe(4);
    expect(screen.getByRole('button', { name: 'Camera speed: 4x' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('follows a change made elsewhere, closes on Escape, and ignores nonsense', () => {
    render(<CameraSpeedButton />);
    act(() => setCameraSpeed(8));
    expect(screen.getByRole('button', { name: 'Camera speed: 8x' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Camera speed: 8x' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('radiogroup')).toBeNull();
    localStorage.setItem('cameraSpeed', '3');
    expect(getCameraSpeed()).toBe(1);
  });

  it('widens the same pill into the speeds instead of opening another', () => {
    render(<CameraSpeedButton />);
    const pill = screen.getByRole('button', { name: 'Camera speed: 1x' }).parentElement!;
    fireEvent.click(screen.getByRole('button', { name: 'Camera speed: 1x' }));
    expect(screen.getByRole('radiogroup')).toBe(pill);
    fireEvent.click(screen.getByRole('radio', { name: '1x' })); // the current one: just shrinks back
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(getCameraSpeed()).toBe(1);
  });
});
