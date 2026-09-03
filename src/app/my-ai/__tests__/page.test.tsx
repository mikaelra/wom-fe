import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MyAiPage from '@/app/my-ai/page';
import { setStoredAccountToken } from '@/lib/http';
import {
  getMyAiStatus,
  toggleMyAi,
  saveMyAiSettings,
  getMyAiPersonality,
  getMyAiMatches,
} from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getMyAiStatus: vi.fn(),
  toggleMyAi: vi.fn(),
  saveMyAiSettings: vi.fn(),
  getMyAiPersonality: vi.fn(),
  getMyAiMatches: vi.fn(),
}));

const status = (over = {}) => ({
  enabled: false,
  minute_counter: 10,
  knobs: {},
  override_rules: [],
  credits: 5,
  trainable: true,
  logged_rows: 60,
  min_rows: 40,
  bot_rank: { tier: null, games_played: 0 },
  queue: { queued: false, queue_size: 0 },
  ...over,
});

beforeEach(() => {
  vi.mocked(getMyAiStatus).mockResolvedValue(status());
  vi.mocked(getMyAiPersonality).mockResolvedValue({ trained: false, deviations: [] });
  vi.mocked(getMyAiMatches).mockResolvedValue({ matches: [] });
  vi.mocked(toggleMyAi).mockResolvedValue({ enabled: true, queued: true, reason: 'queued' });
  vi.mocked(saveMyAiSettings).mockResolvedValue({
    saved: true, enabled: false, minute_counter: 15, knobs: {}, override_rules: [],
  });
  setStoredAccountToken('tok');
});

afterEach(() => {
  setStoredAccountToken(null);
  localStorage.clear();
  vi.clearAllMocks();
});

describe('MyAiPage', () => {
  it('gates on a logged-in account', async () => {
    setStoredAccountToken(null);
    render(<MyAiPage />);
    expect(await screen.findByText(/verified account to train an AI/i)).toBeInTheDocument();
  });

  it('shows the toggle, credits and bot rank once loaded', async () => {
    render(<MyAiPage />);
    expect(await screen.findByRole('button', { name: /AI is OFF/i })).toBeInTheDocument();
    expect(screen.getByText(/buy more/i)).toBeInTheDocument();
    expect(screen.getByText(/Bot rank/i)).toBeInTheDocument();
  });

  it('toggles the AI on and shows the queue reason', async () => {
    render(<MyAiPage />);
    fireEvent.click(await screen.findByRole('button', { name: /AI is OFF/i }));
    expect(await screen.findByText(/plays bot-ranked games while you're away/i)).toBeInTheDocument();
    expect(toggleMyAi).toHaveBeenCalledWith('tok', true);
  });

  it('surfaces the "no credits" toggle reason without erroring', async () => {
    vi.mocked(toggleMyAi).mockResolvedValue({ enabled: true, queued: false, reason: 'no_credits' });
    render(<MyAiPage />);
    fireEvent.click(await screen.findByRole('button', { name: /AI is OFF/i }));
    expect(await screen.findByText(/No credits/i)).toBeInTheDocument();
  });

  it('warns while the AI is still below the training threshold', async () => {
    vi.mocked(getMyAiStatus).mockResolvedValue(status({ trainable: false, logged_rows: 12 }));
    render(<MyAiPage />);
    expect(await screen.findByText((t) => t.includes('12 of ~40 logged'))).toBeInTheDocument();
  });

  it('saves settings with the edited minute counter', async () => {
    render(<MyAiPage />);
    const spin = await screen.findByRole('spinbutton');
    fireEvent.change(spin, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved.');
    expect(saveMyAiSettings).toHaveBeenCalledWith('tok', expect.objectContaining({ minute_counter: 25 }));
  });

  it('adds and removes a hard rule', async () => {
    render(<MyAiPage />);
    fireEvent.click(await screen.findByText('+ add rule'));
    expect(screen.getByRole('button', { name: '✕' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(screen.queryByRole('button', { name: '✕' })).not.toBeInTheDocument();
  });

  it('renders match history rows', async () => {
    vi.mocked(getMyAiMatches).mockResolvedValue({
      matches: [{
        match_id: 'm1', placement: 2, mu_delta: -1.4,
        opponents: [{ name: "Ben's AI", owner: 'Ben', place: 1 }], at: null,
      }],
    });
    render(<MyAiPage />);
    expect(await screen.findByText('#2')).toBeInTheDocument();
    expect(screen.getByText('-1.4')).toBeInTheDocument();
    expect(screen.getByText('Ben')).toBeInTheDocument();
  });
});
