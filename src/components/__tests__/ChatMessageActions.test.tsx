import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/api', () => ({ reportChatMessage: vi.fn() }));

import { reportChatMessage } from '@/lib/api';
import { getMutedPlayers, setMuted } from '@/lib/chatMute';
import { setStoredAccountToken } from '@/lib/http';
import ChatMessageActions from '@/components/chat/ChatMessageActions';

const report = vi.mocked(reportChatMessage);
const target = { sender: 'Toad', message: 'rude words' };

afterEach(() => {
  setStoredAccountToken(null);
  localStorage.clear();
  vi.clearAllMocks();
});

function open(onClose = vi.fn()) {
  render(<ChatMessageActions target={target} context="market" onClose={onClose} />);
  return onClose;
}

describe('ChatMessageActions', () => {
  it('shows nothing without a message', () => {
    const { container } = render(<ChatMessageActions target={null} context="lobby" onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the message, and Mute mutes the sender', () => {
    const onClose = open();
    expect(screen.getByText('rude words')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(getMutedPlayers().has('Toad')).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it('on a muted player\'s message, offers Unmute', () => {
    setMuted('Toad', true);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(getMutedPlayers().has('Toad')).toBe(false);
  });

  it('reports without an account too', async () => {
    report.mockResolvedValue(undefined);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    fireEvent.change(screen.getByLabelText(/wrong with this message/), { target: { value: 'Rude.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Report sent.')).toBeTruthy();
    expect(report).toHaveBeenCalledWith(null, expect.objectContaining({ reportedName: 'Toad' }));
  });

  it('sends a report once something is written', async () => {
    setStoredAccountToken('sess');
    report.mockResolvedValue(undefined);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    const send = screen.getByRole('button', { name: 'Send report' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/wrong with this message/), { target: { value: '  Rude.  ' } });
    fireEvent.click(send);
    expect(await screen.findByText('Report sent.')).toBeTruthy();
    expect(report).toHaveBeenCalledWith('sess', {
      reportedName: 'Toad', message: 'rude words', context: 'market', complaint: 'Rude.',
    });
  });

  it('shows a failure and keeps what was written', async () => {
    setStoredAccountToken('sess');
    report.mockRejectedValue(new Error('Could not send the report.'));
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    fireEvent.change(screen.getByLabelText(/wrong with this message/), { target: { value: 'Rude.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Could not send the report.')).toBeTruthy();
    expect((screen.getByLabelText(/wrong with this message/) as HTMLTextAreaElement).value).toBe('Rude.');
  });

  it('Cancel and a tap outside close it', () => {
    setStoredAccountToken('sess');
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
