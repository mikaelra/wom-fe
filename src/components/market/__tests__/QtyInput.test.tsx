import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QtyInput } from '@/components/market/CraftOfferModal';

/** A tiny host that owns the committed value, like SideList does. */
function Host({ start = 1, max = 99 }: { start?: number; max?: number }) {
  const [n, setN] = useState(start);
  return (
    <>
      <QtyInput value={n} max={max} onCommit={setN} />
      <output data-testid="committed">{n}</output>
    </>
  );
}

const box = () => screen.getByLabelText('Quantity') as HTMLInputElement;
const committed = () => screen.getByTestId('committed').textContent;

describe('QtyInput', () => {
  it('lets you clear the field and type a fresh number', () => {
    render(<Host start={3} />);

    fireEvent.change(box(), { target: { value: '' } });
    expect(box().value).toBe(''); // no snap-back to "3" while focused

    fireEvent.change(box(), { target: { value: '5' } });
    expect(box().value).toBe('5');
    expect(committed()).toBe('5'); // a valid number commits live
  });

  it('reverts to the last valid value when you leave an empty box', () => {
    render(<Host start={4} />);

    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.blur(box());

    expect(box().value).toBe('4');
    expect(committed()).toBe('4');
  });

  it('reverts on an invalid entry (non-numeric, zero, fractional)', () => {
    render(<Host start={2} />);

    for (const bad of ['abc', '0', '1.5', '-3']) {
      fireEvent.change(box(), { target: { value: bad } });
      fireEvent.blur(box());
      expect(box().value).toBe('2');
    }
    expect(committed()).toBe('2');
  });

  it('clamps to max', () => {
    render(<Host start={1} max={10} />);

    fireEvent.change(box(), { target: { value: '999' } });
    fireEvent.blur(box());

    expect(box().value).toBe('10');
    expect(committed()).toBe('10');
  });

  it('follows the committed value when it changes from outside', () => {
    const { rerender } = render(<QtyInput value={1} max={99} onCommit={vi.fn()} />);
    expect(box().value).toBe('1');

    rerender(<QtyInput value={3} max={99} onCommit={vi.fn()} />);
    expect(box().value).toBe('3');
  });

  it('Enter blurs the field (committing it)', () => {
    render(<Host start={1} />);
    const input = box();
    input.focus();
    fireEvent.change(input, { target: { value: '7' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(document.activeElement).not.toBe(input);
    expect(committed()).toBe('7');
  });
});
