import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TimewarpPanel from '@/components/worldmap/TimewarpPanel';

describe('TimewarpPanel', () => {
  it('plays the full moon', () => {
    const onPlay = vi.fn();
    render(<TimewarpPanel onPlay={onPlay} />);

    fireEvent.click(screen.getByRole('button', { name: 'Full Moon' }));

    expect(onPlay).toHaveBeenCalledWith('full_moon');
  });

  it('plays a conjunction of the two planets chosen', () => {
    const onPlay = vi.fn();
    render(<TimewarpPanel onPlay={onPlay} />);

    fireEvent.change(screen.getByLabelText('First planet'), { target: { value: 'Mars' } });
    fireEvent.change(screen.getByLabelText('Second planet'), { target: { value: 'Saturn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conjunction' }));

    expect(onPlay).toHaveBeenCalledWith('Mars-Saturn');
  });

  it('starts on Mercury and Jupiter, and will not pair a planet with itself', () => {
    render(<TimewarpPanel onPlay={vi.fn()} />);

    const first = screen.getByLabelText('First planet') as HTMLSelectElement;
    const second = screen.getByLabelText('Second planet') as HTMLSelectElement;
    expect([first.value, second.value]).toEqual(['Mercury', 'Jupiter']);
    expect((first.querySelector('option[value="Jupiter"]') as HTMLOptionElement).disabled).toBe(true);
    expect((second.querySelector('option[value="Mercury"]') as HTMLOptionElement).disabled).toBe(true);
  });
});
