import { describe, expect, it } from 'vitest';
import { anchorOverField, typingField } from '@/lib/blimkinAnchor';

describe('blimkinAnchor', () => {
  it('finds a text field being typed in, not a button or a checkbox', () => {
    const text = document.createElement('input');
    const search = Object.assign(document.createElement('input'), { type: 'search' });
    const box = Object.assign(document.createElement('input'), { type: 'checkbox' });
    const area = document.createElement('textarea');
    const button = document.createElement('button');
    expect(typingField(text)).toBe(text);
    expect(typingField(search)).toBe(search);
    expect(typingField(area)).toBe(area);
    expect(typingField(box)).toBeNull();
    expect(typingField(button)).toBeNull();
    expect(typingField(null)).toBeNull();
  });

  it('counts a contenteditable as a field', () => {
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(typingField(div)).toBe(div);
  });

  it('stands him on the field, measured from the window foot', () => {
    expect(anchorOverField({ left: 40, top: 500 }, 400, 800)).toEqual({ left: 40, bottom: 308 });
  });

  it('keeps him inside the window', () => {
    expect(anchorOverField({ left: 300, top: 500 }, 400, 800).left).toBe(108);
    expect(anchorOverField({ left: -20, top: 500 }, 400, 800).left).toBe(12);
    expect(anchorOverField({ left: 40, top: 900 }, 400, 800).bottom).toBe(12);
  });
});
