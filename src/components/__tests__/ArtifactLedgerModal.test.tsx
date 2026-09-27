import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ArtifactLedgerModal from '@/components/ArtifactLedgerModal';

vi.mock('@/components/ArtifactLedger', () => ({
  default: ({ highlightOrdinal, highlightLabel }: { highlightOrdinal: number | null; highlightLabel?: string }) => (
    <p>ledger {String(highlightOrdinal)} {highlightLabel}</p>
  ),
}));
// eslint-disable-next-line @next/next/no-img-element -- test stub for next/image
vi.mock('next/image', () => ({ default: () => <img alt="" /> }));

// jsdom has no layout, so no scrollIntoView -- the reveal calls it.
Element.prototype.scrollIntoView = vi.fn();

describe('ArtifactLedgerModal tabs', () => {
  const open = (props: Partial<Parameters<typeof ArtifactLedgerModal>[0]> = {}) => {
    render(<ArtifactLedgerModal onClose={() => {}} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Reveal/ }));
  };

  it('opens on the discoverers, marking the original a copy descends from', () => {
    open({ highlightOrdinal: 2, highlightLabel: '(your copy: Bob#2)' });
    expect(screen.getByText('ledger 2 (your copy: Bob#2)')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Discoverers of Artifact#1' }).getAttribute('aria-selected')).toBe('true');
  });

  it('lists who it was transcribed to, in order, on the second tab', () => {
    open({
      transcribedTo: [
        { name: 'Dan', origin: 'Cleo#1', copy_number: 1, at: '2026-09-27T12:00:00Z' },
        { name: 'Eve', origin: 'Cleo#2', copy_number: 2, at: null },
      ],
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Transcribed to' }));
    expect(screen.getByText('Dan')).toBeTruthy();
    expect(screen.getByText('#2')).toBeTruthy();
    expect(screen.queryByText(/^ledger/)).toBeNull();
  });

  it('says so when it has not been transcribed to anyone', () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'Transcribed to' }));
    expect(screen.getByText('No one yet.')).toBeTruthy();
  });
});
