import { describe, expect, it } from 'vitest';
import { WHEEL_EMOJI, splitWheelEmoji } from '@/lib/wheelEmoji';

describe('splitWheelEmoji', () => {
  it('leaves text without the wheel emoji alone', () => {
    expect(splitWheelEmoji('Player A attacked Player B')).toEqual(['Player A attacked Player B']);
    expect(splitWheelEmoji('')).toEqual(['']);
  });

  it("marks where the backend's wheel emoji stood", () => {
    expect(splitWheelEmoji('🎡 You won a Wheel! 🎡')).toEqual([null, ' You won a Wheel! ', null]);
    expect(splitWheelEmoji('🎡 You won a Wheel! Connect an email to your name to claim it. 🎡')).toEqual([
      null,
      ' You won a Wheel! Connect an email to your name to claim it. ',
      null,
    ]);
  });

  it('keeps text on both sides and handles two in a row', () => {
    expect(splitWheelEmoji(`a${WHEEL_EMOJI}${WHEEL_EMOJI}b`)).toEqual(['a', null, null, 'b']);
  });
});
