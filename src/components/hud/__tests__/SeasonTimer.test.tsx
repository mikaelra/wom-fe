import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SeasonTimer, { formatCountdown } from '@/components/hud/SeasonTimer';
import { getCurrentSeason } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getCurrentSeason: vi.fn(),
}));

describe('formatCountdown', () => {
  it('shows only days when more than a day remains', () => {
    expect(formatCountdown(3 * 86400_000 + 5 * 3600_000)).toBe('3 days');
  });

  it('shows only hours when less than a day remains', () => {
    expect(formatCountdown(5 * 3600_000 + 30 * 60_000)).toBe('5 hours');
  });

  it('shows only minutes when less than an hour remains', () => {
    expect(formatCountdown(23 * 60_000 + 45_000)).toBe('23 minutes');
  });

  it('shows only seconds when less than a minute remains', () => {
    expect(formatCountdown(45_000)).toBe('45 seconds');
  });

  it('clamps a past deadline to 0 seconds rather than going negative', () => {
    expect(formatCountdown(-5000)).toBe('0 seconds');
  });

  it('singularizes exactly 1 of a unit', () => {
    expect(formatCountdown(86400_000 + 1000)).toBe('1 day');
    expect(formatCountdown(3600_000 + 1000)).toBe('1 hour');
    expect(formatCountdown(60_000 + 1000)).toBe('1 minute');
    expect(formatCountdown(1000)).toBe('1 second');
  });
});

// The JSX interpolates the countdown into its own text node, so the full
// sentence is split across siblings within the <p> -- matched here by the
// element's whole textContent rather than a single text node.
function byFullText(match: string | RegExp) {
  return (_content: string, element: Element | null) => {
    if (element?.tagName !== 'P' || !element.textContent) return false;
    return typeof match === 'string' ? element.textContent === match : match.test(element.textContent);
  };
}

describe('SeasonTimer', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders nothing until the season loads', () => {
    vi.mocked(getCurrentSeason).mockReturnValue(new Promise(() => {}));
    const { container } = render(<SeasonTimer />);

    expect(container.textContent).toBe('');
  });

  it('renders the season name and countdown once loaded, in italic', async () => {
    // A few seconds past the exact 3-day mark, not on it -- any time that
    // elapses between computing this and the component reading Date.now()
    // (inevitable, even if just milliseconds) would otherwise floor an
    // exact "3 * 86400_000" down to 2d.
    const endsAt = new Date(Date.now() + 3 * 86400_000 + 5_000).toISOString();
    vi.mocked(getCurrentSeason).mockResolvedValue({ name: 'Fall 2026', ends_at: endsAt });

    render(<SeasonTimer />);
    const message = await screen.findByText(byFullText('Fall 2026. New season in 3 days.'));

    expect(message.className).toContain('italic');
  });

  it('ticks the countdown down as time passes, without refetching', async () => {
    // Real timers (no vi.useFakeTimers): the component's own
    // setInterval(…, 1000) needs to actually fire. Kept inside the
    // seconds bucket throughout (a few seconds out) so the test only has
    // to wait a couple of real seconds, not cross a minute/hour boundary.
    const endsAt = new Date(Date.now() + 4_000).toISOString();
    vi.mocked(getCurrentSeason).mockResolvedValue({ name: 'Fall 2026', ends_at: endsAt });

    render(<SeasonTimer />);
    await screen.findByText(byFullText(/^Fall 2026\. New season in [34] seconds\.$/));

    await screen.findByText(
      byFullText(/^Fall 2026\. New season in (0 seconds|1 second|2 seconds)\.$/),
      {},
      { timeout: 4_000, interval: 200 },
    );

    expect(getCurrentSeason).toHaveBeenCalledTimes(1);
  }, 10_000);
});
