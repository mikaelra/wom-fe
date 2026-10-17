import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CityOverlay from '@/components/city/CityOverlay';
import { setStoredAccountToken } from '@/lib/http';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/api', () => ({ getInventory: vi.fn(), logOut: vi.fn() }));

describe('CityOverlay', () => {
  beforeEach(() => {
    localStorage.clear();
    setStoredAccountToken(null);
  });

  it('has the music button and no sound-effects button: the city has no effects to mute', () => {
    render(<CityOverlay clock={<span>12:00 clock</span>} />);
    expect(screen.getByRole('button', { name: 'Mute music' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sound effects/ })).not.toBeInTheDocument();
    expect(screen.getByText('12:00 clock')).toBeInTheDocument();
  });

  it('says which sky is on view when the time was overridden', () => {
    render(<CityOverlay skyClock="21:00 17.10.2026" />);
    expect(screen.getByText(/21:00 17\.10\.2026/)).toBeInTheDocument();
  });
});
