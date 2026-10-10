import { describe, it, expect } from 'vitest';
import { steamClientUrl } from './steamPage.js';

describe('steamClientUrl', () => {
  it("opens Steam's approval page in the Steam client", () => {
    const url = 'https://store.steampowered.com/checkout/approvetxn/123456/?returnurl=x';
    expect(steamClientUrl(url)).toBe(`steam://openurl/${url}`);
  });

  it('accepts steampowered.com itself', () => {
    expect(steamClientUrl('https://steampowered.com/')).toBe('steam://openurl/https://steampowered.com/');
  });

  it('refuses anything that is not https on steampowered.com', () => {
    for (const url of [
      'http://store.steampowered.com/checkout/approvetxn/1/',
      'https://evil.example/store.steampowered.com',
      'https://store.steampowered.com.evil.example/',
      'https://notsteampowered.com/',
      'file:///etc/passwd',
      'steam://run/1',
      'not a url',
      undefined,
    ]) {
      expect(steamClientUrl(url)).toBeNull();
    }
  });
});
