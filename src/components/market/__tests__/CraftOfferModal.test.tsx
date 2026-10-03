import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import CraftOfferModal, { type OwnedItem } from '@/components/market/CraftOfferModal';
import { ARTIFACT_NEEDS_HINT, TRANSCRIBE_HOLDER_NOTE, type MarketCatalog } from '@/lib/market';

const PAPER = 11;
const PEN = 12;
const catalog: MarketCatalog = {
  skins: [],
  relics: [{ id: 1, name: "Hades' Coin" }, { id: PAPER, name: 'Paper' }, { id: PEN, name: 'Pen' }],
  wheel_kinds: [],
  coin_relic_id: 1,
  paper_relic_id: PAPER,
  pen_relic_id: PEN,
  terms_version: '1',
  terms_text: '',
};
const paper: OwnedItem = { input: { item_type: 'relic', relic_id: PAPER, quantity: 1 }, label: 'Paper', count: 1 };
const pen: OwnedItem = { input: { item_type: 'relic', relic_id: PEN, quantity: 1 }, label: 'Pen', count: 1 };
const coin: OwnedItem = { input: { item_type: 'relic', relic_id: 1, quantity: 1 }, label: "Hades' Coin", count: 2 };
const artifact: OwnedItem = { input: { item_type: 'artifact', quantity: 1 }, label: 'Artifact', count: 1 };

const open = (owned: OwnedItem[]) =>
  render(
    <CraftOfferModal kind="quick" catalog={catalog} owned={owned} coinsAvailable={0}
      onSubmit={async () => {}} onClose={() => {}} />,
  );

const wantSection = () => screen.getByText('You want').closest('section') as HTMLElement;
const giveSection = () => screen.getByText('You give').closest('section') as HTMLElement;
const wantArtifact = () => within(wantSection()).queryByRole('button', { name: /^Artifact/ }) as HTMLButtonElement | null;

describe('CraftOfferModal -- Paper + Pen -> Artifact', () => {
  it('always shows the Artifact to ask for, greyed out with what it needs until a Paper and a Pen are on your side', () => {
    open([paper, pen, coin]);
    expect(wantArtifact()?.disabled).toBe(true);
    expect(wantArtifact()?.textContent).toContain(ARTIFACT_NEEDS_HINT);

    fireEvent.click(within(giveSection()).getByRole('button', { name: /^Paper/ }));
    expect(wantArtifact()?.disabled).toBe(true);

    fireEvent.click(within(giveSection()).getByRole('button', { name: /^Pen/ }));
    expect(wantArtifact()?.disabled).toBe(false);
    expect(wantArtifact()?.textContent).toBe('Artifact');
  });

  it('never offers it to ask for to someone who already has one', () => {
    open([paper, pen, artifact]);
    fireEvent.click(within(giveSection()).getByRole('button', { name: /^Paper/ }));
    fireEvent.click(within(giveSection()).getByRole('button', { name: /^Pen/ }));

    expect(wantArtifact()).toBeNull();
  });

  it('tells the Artifact holder in red what a Transcribe does and does not do', () => {
    open([artifact]);
    fireEvent.click(within(giveSection()).getByRole('button', { name: /^Artifact/ }));
    fireEvent.click(within(wantSection()).getByRole('button', { name: 'Paper' }));
    fireEvent.click(within(wantSection()).getByRole('button', { name: 'Pen' }));
    fireEvent.click(screen.getByRole('button', { name: /Review/ }));

    expect(screen.getByText(TRANSCRIBE_HOLDER_NOTE)).toHaveClass('text-red-400');
    expect(screen.getByRole('button', { name: 'Post Transcribe' })).toBeTruthy();
  });
});
