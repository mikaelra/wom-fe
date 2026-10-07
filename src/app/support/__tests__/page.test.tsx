import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SupportPage from '@/app/support/page';
import PrivacyPage from '@/app/privacy/page';

describe('SupportPage', () => {
  it('gives the support email and the way to report, mute and delete', () => {
    render(<SupportPage />);
    const mail = screen.getByRole('link', { name: 'support@worldofmythos.net' });
    expect(mail.getAttribute('href')).toBe('mailto:support@worldofmythos.net');
    expect(screen.getByText(/choose Report, or Mute/)).toBeTruthy();
    expect(screen.getByText(/Delete account/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
  });
});

describe('PrivacyPage', () => {
  it('covers chat reports, Apple and Steam', () => {
    render(<PrivacyPage />);
    expect(screen.getByText('Chat reports.')).toBeTruthy();
    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.getByText('Valve (Steam)')).toBeTruthy();
    expect(screen.getByText(/Last updated: 7 October 2026/)).toBeTruthy();
  });
});
