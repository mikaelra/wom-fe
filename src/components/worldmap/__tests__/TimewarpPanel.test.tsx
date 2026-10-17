import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TimewarpPanel from '@/components/worldmap/TimewarpPanel';

describe('TimewarpPanel', () => {
  it('plays the full moon', () => {
    const onPlay = vi.fn();
    render(<TimewarpPanel onPlay={onPlay} onPlayEnd={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Full Moon' }));

    expect(onPlay).toHaveBeenCalledWith('full_moon');
  });

  it('plays a conjunction of the two planets chosen', () => {
    const onPlay = vi.fn();
    render(<TimewarpPanel onPlay={onPlay} onPlayEnd={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('First planet'), { target: { value: 'Mars' } });
    fireEvent.change(screen.getByLabelText('Second planet'), { target: { value: 'Saturn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conjunction' }));

    expect(onPlay).toHaveBeenCalledWith('Mars-Saturn');
  });

  it('starts on Mercury and Jupiter, and will not pair a planet with itself', () => {
    render(<TimewarpPanel onPlay={vi.fn()} onPlayEnd={vi.fn()} />);

    const first = screen.getByLabelText('First planet') as HTMLSelectElement;
    const second = screen.getByLabelText('Second planet') as HTMLSelectElement;
    expect([first.value, second.value]).toEqual(['Mercury', 'Jupiter']);
    expect((first.querySelector('option[value="Jupiter"]') as HTMLOptionElement).disabled).toBe(true);
    expect((second.querySelector('option[value="Mercury"]') as HTMLOptionElement).disabled).toBe(true);
  });

  it('plays a test moment at its own time, in all of its colours', () => {
    const onPlay = vi.fn();
    render(<TimewarpPanel onPlay={onPlay} onPlayEnd={vi.fn()} />);

    const select = screen.getByLabelText('Test moment') as HTMLSelectElement;
    const three = Array.from(select.options).findIndex((o) => o.text.startsWith('Three conjunctions'));
    fireEvent.change(select, { target: { value: String(three) } });
    fireEvent.click(screen.getByRole('button', { name: 'Play moment' }));

    expect(onPlay).toHaveBeenCalledWith('Mars-Saturn,Mercury-Saturn,Mercury-Mars', '2026-04-20T11:20:17Z');
  });

  it("plays a test moment's end, from its own time back to now", () => {
    const onPlay = vi.fn();
    const onPlayEnd = vi.fn();
    render(<TimewarpPanel onPlay={onPlay} onPlayEnd={onPlayEnd} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play end' }));

    expect(onPlayEnd).toHaveBeenCalledWith('full_moon', '2026-10-26T05:00:00Z');
    expect(onPlay).not.toHaveBeenCalled();
  });
});
