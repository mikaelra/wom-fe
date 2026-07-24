import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RankBadge from '@/components/hud/RankBadge';

describe('RankBadge', () => {
  it('renders the tier name', () => {
    render(<RankBadge tier="Wizard I" />);
    expect(screen.getByText('Wizard I')).toBeInTheDocument();
  });

  it('renders "Unranked" for a null tier (never queued, or still in placements)', () => {
    render(<RankBadge tier={null} />);
    expect(screen.getByText('Unranked')).toBeInTheDocument();
  });

  it('falls back to the unranked color for an unrecognized tier string', () => {
    render(<RankBadge tier="Some Future Tier" />);
    const badge = screen.getByText('Some Future Tier');
    expect(badge.className).toContain('bg-gray-700');
  });
});
