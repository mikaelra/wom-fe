import type { ReactNode } from 'react';
import type { GuideHighlights } from '@/lib/guideHighlights';

export type GuideStep = {
  text: ReactNode;
  highlights: GuideHighlights;
  // A second group of buttons this step also calls out -- GuideStepPreview
  // merges `highlights` and `altHighlights` into one static illustration
  // showing every referenced button/card at once (see its own comment).
  altHighlights?: GuideHighlights;
  // Opts this step's static preview (RulesModal / rules pages -- see
  // GuideStepPreview) into a dedicated example instead of the default
  // highlighted-buttons stage.
  example?: 'atkAffordability';
};

// Single source of truth for "how do I play" copy: the static Rules popup
// (RulesModal, opened on-demand from the pre-game lobby) and the standalone
// /rules pages (both via GuideStepPreview's illustrated buttons/cards).
export const GUIDE_STEPS: GuideStep[] = [
  { text: 'Welcome to World of Mythos! Be the last one standing!', highlights: {} },
  { text: 'This is your health. When it reaches 0 or lower, you are out.', highlights: { hp: 'blue' } },
  {
    text: 'Each turn you must do one main action and one resource action.',
    highlights: { attack: 'blue', well: 'blue', defend: 'blue' },
    altHighlights: { hp: 'blue', coins: 'blue', atk: 'blue' },
  },
  { text: 'The main actions are ATTACK, WELL or DEFEND.', highlights: { attack: 'blue', well: 'blue', defend: 'blue' } },
  { text: 'The resource actions are Gain 1 HP, Gain 1 Coin or upgrade ATK.', highlights: { hp: 'blue', coins: 'blue', atk: 'blue' } },
  { text: 'How much damage you do to enemies is determined by your ATK.', highlights: { atk: 'blue' } },
  {
    text: 'To upgrade your ATK, you need to spend your current ATK value in COINS.',
    highlights: { coins: 'gold', atk: 'blue' },
    example: 'atkAffordability',
  },
  {
    text: 'Choosing ATTACK deals damage to your target equal to your ATK — but it can be blocked.',
    highlights: { attack: 'blue', atk: 'blue' },
  },
  { text: 'Choosing DEFEND gives you a 50% chance to block each incoming attack…', highlights: { defend: 'blue' } },
  { text: '…and a 10% chance of REFLECTING the attack back to your attacker!', highlights: { defend: 'blue' } },
  { text: 'The WELL is where you go to play the game of chance.', highlights: { well: 'blue' } },
  { text: 'One player wins among all those who chose the WELL.', highlights: { well: 'blue' } },
  { text: 'That player STARTS each round, shown with the crown, and gets a random prize.', highlights: { well: 'blue' } },
  { text: 'The prize can be some coins, information and many more things.', highlights: { well: 'blue' } },
  { text: 'You might get lucky and find the poisoned dagger.', highlights: { well: 'gold' } },
  { text: 'World of Mythos is a social game, so don’t forget that you can team up, lie or scheme when playing.', highlights: {} },
  { text: 'Good luck!', highlights: {} },
];
