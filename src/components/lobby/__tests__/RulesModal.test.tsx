import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RulesModal from '@/components/lobby/RulesModal';
import { GUIDE_STEPS } from '@/lib/guideSteps';

describe('RulesModal', () => {
  it('shows the first step and steps forward/back through the shared guide content', () => {
    render(<RulesModal onClose={vi.fn()} />);
    expect(screen.getByText(GUIDE_STEPS[0].text as string)).toBeInTheDocument();
    expect(screen.getByText(`1 / ${GUIDE_STEPS.length}`)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next'));
    expect(screen.getByText(GUIDE_STEPS[1].text as string)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Previous'));
    expect(screen.getByText(GUIDE_STEPS[0].text as string)).toBeInTheDocument();
  });

  it('disables Previous on the first step and Next on the last', () => {
    render(<RulesModal onClose={vi.fn()} />);
    expect(screen.getByLabelText('Previous')).toBeDisabled();

    for (let i = 0; i < GUIDE_STEPS.length - 1; i++) {
      fireEvent.click(screen.getByLabelText('Next'));
    }
    expect(screen.getByLabelText('Next')).toBeDisabled();
  });

  it('calls onClose from the close button and from clicking the backdrop', () => {
    const onClose = vi.fn();
    const { rerender } = render(<RulesModal onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close rules'));
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(<RulesModal onClose={onClose} />);
    fireEvent.click(screen.getByText(GUIDE_STEPS[0].text as string).closest('.fixed')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the card itself', () => {
    const onClose = vi.fn();
    render(<RulesModal onClose={onClose} />);
    fireEvent.click(screen.getByText('Rules'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
