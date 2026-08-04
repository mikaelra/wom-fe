import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import GuideStepPreview from '@/components/rules/GuideStepPreview';
import type { GuideStep } from '@/lib/guideSteps';

const step = (partial: Partial<GuideStep>): GuideStep => ({ text: '', highlights: {}, ...partial });

describe('GuideStepPreview', () => {
  it('renders nothing for a step with no highlighted targets', () => {
    const { container } = render(<GuideStepPreview step={step({ highlights: {} })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the real button art for action highlights', () => {
    render(<GuideStepPreview step={step({ highlights: { attack: 'blue', well: 'blue', defend: 'blue' } })} />);
    expect(screen.getByAltText('Attack')).toBeInTheDocument();
    expect(screen.getByAltText('The Well')).toBeInTheDocument();
    expect(screen.getByAltText('Defend')).toBeInTheDocument();
  });

  it('renders the real resource cards for resource highlights', () => {
    render(<GuideStepPreview step={step({ highlights: { hp: 'blue', coins: 'gold', atk: 'blue' } })} />);
    expect(screen.getByText('HP')).toBeInTheDocument();
    expect(screen.getByText('Coins')).toBeInTheDocument();
    expect(screen.getByText('ATK')).toBeInTheDocument();
  });

  it('merges highlights and altHighlights into one static preview instead of blinking', () => {
    render(
      <GuideStepPreview
        step={step({
          highlights: { attack: 'blue', well: 'blue', defend: 'blue' },
          altHighlights: { hp: 'blue', coins: 'blue', atk: 'blue' },
        })}
      />,
    );
    expect(screen.getByAltText('Attack')).toBeInTheDocument();
    expect(screen.getByText('HP')).toBeInTheDocument();
  });

  it('renders the affordability example instead of the default stage when the step opts in', () => {
    render(
      <GuideStepPreview
        step={step({ highlights: { coins: 'gold', atk: 'blue' }, example: 'atkAffordability' })}
      />,
    );
    // Two Coins/ATK pairs (one affordable, one not), not the single default pair.
    expect(screen.getAllByText('Coins')).toHaveLength(2);
    expect(screen.getAllByText('ATK')).toHaveLength(2);
  });
});
