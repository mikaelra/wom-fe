import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ShopCancelPage from '@/app/shop/cancel/page';

describe('ShopCancelPage', () => {
  it('states plainly that no charge was made, with a way back to the shop', () => {
    render(<ShopCancelPage />);
    expect(screen.getByText('No charge was made.')).toBeInTheDocument();
    expect(screen.getByText('Back to Shop')).toHaveAttribute('href', '/shop');
  });
});
