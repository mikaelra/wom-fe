import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MyAiPage from '@/app/my-ai/page';
import { setStoredAccountToken } from '@/lib/http';
import {
  getMyAiStatus,
  toggleMyAi,
  saveMyAiSettings,
  getMyAiMatches,
} from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getMyAiStatus: vi.fn(),
  toggleMyAi: vi.fn(),
  saveMyAiSettings: vi.fn(),
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
    expect(await screen.findByText((t) => t.includes('12 of ~40 rounds logged'))).toBeInTheDocument();
    expect(
      screen.getByText((t) => t.includes('ranked and bot-ranked games you play yourself')),
    ).toBeInTheDocument();
  });

  it('explains where credits come from behind the ⓘ button', async () => {
    render(<MyAiPage />);
    fireEvent.click(await screen.findByRole('button', { name: /how credits work/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/one every time you finish a ranked or bot-ranked game/i);
    expect(dialog).toHaveTextContent(/buy a pack of 10 in the shop/i);
  });

  it('saves settings with the edited minute counter', async () => {
    render(<MyAiPage />);
    const spin = await screen.findByRole('spinbutton');
    fireEvent.change(spin, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved.');
    expect(saveMyAiSettings).toHaveBeenCalledWith('tok', expect.objectContaining({ minute_counter: 25 }));
  });

  it('defaults the influence slider to 100 and saves an edited value', async () => {
    render(<MyAiPage />);
    const influence = (await screen.findByText('Influence'))
      .closest('div')!.parentElement!.querySelector('input[type="range"]') as HTMLInputElement;
    expect(influence).toHaveValue('100');

    fireEvent.change(influence, { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved.');
    expect(saveMyAiSettings).toHaveBeenCalledWith(
      'tok', expect.objectContaining({ knobs: expect.objectContaining({ influence: 40 }) }),
    );
  });

  it('adds and removes a hard rule', async () => {
    render(<MyAiPage />);
    fireEvent.click(await screen.findByText('+ add rule'));
    expect(screen.getByRole('button', { name: '✕' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
    expect(screen.queryByRole('button', { name: '✕' })).not.toBeInTheDocument();
  });

  it('shows a target picker only when the rule action is attack', async () => {
    render(<MyAiPage />);
    fireEvent.click(await screen.findByText('+ add rule'));
    // default rule is "defend" -> no target picker
    expect(screen.queryByRole('option', { name: 'the weakest' })).not.toBeInTheDocument();

    const actionSelect = screen.getAllByRole('combobox')
      .find((s) => (s as HTMLSelectElement).value === 'defend')!;
    fireEvent.change(actionSelect, { target: { value: 'attack' } });
    expect(screen.getByRole('option', { name: 'whoever hit me' })).toBeInTheDocument();
  });

  describe('action split sliders', () => {
    // Scoped to the "Action split" block -- the page also has a 0..100
    // Influence slider now, which would otherwise match the same
    // min/max/step and get pulled into this list.
    function splitSliders() {
      const container = screen.getByText('Action split').closest('div')!;
      return within(container).getAllByRole('slider');
    }

    it('defaults to a near-even 34/33/33 split', async () => {
      render(<MyAiPage />);
      await screen.findByText('Action split');
      const [attack, defend, well] = splitSliders();
      expect(attack).toHaveValue('34');
      expect(defend).toHaveValue('33');
      expect(well).toHaveValue('33');
    });

    it('takes the delta from the most recently touched other slider first', async () => {
      render(<MyAiPage />);
      await screen.findByText('Action split');
      const [attack, defend, well] = splitSliders();

      // Nothing touched yet -- dragging attack up by 26 takes it all from
      // defend (the untouched pair's default order), leaving well alone.
      fireEvent.change(attack, { target: { value: '60' } });
      expect(attack).toHaveValue('60');
      expect(defend).toHaveValue('7');
      expect(well).toHaveValue('33');

      // Now drag well up by 17 -- attack (just touched, so "most recently
      // altered of the other two") gives it up, not defend.
      fireEvent.change(well, { target: { value: '50' } });
      expect(well).toHaveValue('50');
      expect(attack).toHaveValue('43');
      expect(defend).toHaveValue('7');   // untouched by this drag
    });

    it('always sums to 100, spilling into the third slider when the partner clamps', async () => {
      render(<MyAiPage />);
      await screen.findByText('Action split');
      const [attack, defend, well] = splitSliders();

      // Drag defend down to 5 -- its partner (attack, untouched-pair's
      // default order) absorbs the full +28, well is untouched: 62/5/33.
      fireEvent.change(defend, { target: { value: '5' } });
      expect(attack).toHaveValue('62');
      expect(well).toHaveValue('33');

      // Drag attack up to 95 (+33). Its partner is now defend (just
      // touched), but defend only has 5 to give before it clamps at 0 --
      // the remaining 28 spills onto well, the least-recently-touched.
      fireEvent.change(attack, { target: { value: '95' } });
      expect(defend).toHaveValue('0');
      expect(well).toHaveValue('5');
      expect(attack).toHaveValue('95');
      const total = [attack, defend, well]
        .reduce((sum, el) => sum + Number((el as HTMLInputElement).value), 0);
      expect(total).toBe(100);
    });
  });

  it('renders match history rows with rank-after and end time', async () => {
    vi.mocked(getMyAiMatches).mockResolvedValue({
      matches: [{
        match_id: 'm1', placement: 2, rank: 'Djinn I',
        opponents: [{ name: "Ben's AI", owner: 'Ben', place: 1 }],
        at: '2026-09-03T14:03:00Z',
      }],
    });
    render(<MyAiPage />);
    expect(await screen.findByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Djinn I')).toBeInTheDocument();
    expect(screen.getByText("Ben's AI")).toBeInTheDocument();   // the agent name, not the owner
    expect(screen.getByText(/\d{2}:\d{2}/)).toBeInTheDocument();   // the end time
  });

  it('shows a dash for the rank while the AI is still in placement', async () => {
    vi.mocked(getMyAiMatches).mockResolvedValue({
      matches: [{
        match_id: 'm1', placement: 1, rank: null,
        opponents: [], at: null,
      }],
    });
    render(<MyAiPage />);
    expect(await screen.findByText('#1')).toBeInTheDocument();
    const cells = screen.getAllByText('—');
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });
});
