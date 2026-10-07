import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { isChatFilterOn } from '@/lib/chatFilter';
import ChatFilterPanel from '@/components/settings/ChatFilterPanel';

afterEach(() => localStorage.clear());

describe('ChatFilterPanel', () => {
  it('is ticked by default and turns the filter off and on', () => {
    render(<ChatFilterPanel />);
    const box = screen.getByRole('checkbox', { name: 'Filter bad words in chat' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    expect(isChatFilterOn()).toBe(false);
    fireEvent.click(box);
    expect(isChatFilterOn()).toBe(true);
  });
});
