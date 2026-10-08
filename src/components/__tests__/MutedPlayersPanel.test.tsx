import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { getMutedPlayers, setMuted } from '@/lib/chatMute';
import MutedPlayersPanel from '@/components/settings/MutedPlayersPanel';

afterEach(() => localStorage.clear());

describe('MutedPlayersPanel', () => {
  it('shows nothing while nobody is muted', () => {
    const { container } = render(<MutedPlayersPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('lists the muted players and unmutes them', () => {
    act(() => {
      setMuted('Toad', true);
      setMuted('Bo', true);
    });
    render(<MutedPlayersPanel />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['🔇 BoUnmute', '🔇 ToadUnmute']);
    fireEvent.click(screen.getAllByRole('button', { name: 'Unmute' })[0]);
    expect([...getMutedPlayers()]).toEqual(['Toad']);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
