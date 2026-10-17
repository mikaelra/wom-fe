import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TranscribedToList from '@/components/TranscribedToList';
import { getArtifactTranscribedTo } from '@/lib/api';

vi.mock('@/lib/api', () => ({ getArtifactTranscribedTo: vi.fn() }));
vi.mock('@/lib/http', () => ({ getStoredAccountToken: () => 't' }));

const mocked = vi.mocked(getArtifactTranscribedTo);

const skoober = { id: 11, name: 'Skoober', origin: 'Oni#1', copy_number: 1, transcribed_count: 1, at: null };
const dan = { id: 13, name: 'Dan', origin: 'Oni#2', copy_number: 2, transcribed_count: 0, at: null };

beforeEach(() => {
  mocked.mockReset();
  mocked.mockResolvedValue({
    name: 'Skoober',
    transcribed_to: [{ id: 12, name: 'Blimkin', origin: 'Skoober#1', copy_number: 1, transcribed_count: 0, at: null }],
  });
});

describe('TranscribedToList', () => {
  it('opens who someone transcribed it to in turn, and back', async () => {
    render(<TranscribedToList entries={[skoober, dan]} />);
    // Dan transcribed it to no one: nothing to open.
    expect(screen.queryByRole('button', { name: /Dan/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Skoober/ }));

    await waitFor(() => expect(screen.getByText('Blimkin')).toBeTruthy());
    expect(mocked).toHaveBeenCalledWith('t', 11);
    expect(screen.queryByText('Dan')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'You' }));

    expect(screen.getByText('Dan')).toBeTruthy();
    expect(screen.queryByText('Blimkin')).toBeNull();
  });

  it('shows why when it cannot load', async () => {
    mocked.mockRejectedValue(new Error('nope'));
    render(<TranscribedToList entries={[skoober]} />);

    fireEvent.click(screen.getByRole('button', { name: /Skoober/ }));

    await waitFor(() => expect(screen.getByText('nope')).toBeTruthy());
  });
});
