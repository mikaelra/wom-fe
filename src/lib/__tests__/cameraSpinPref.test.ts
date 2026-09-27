import { describe, expect, it } from 'vitest';
import { CAMERA_SPIN_COOKIE, cameraSpinCookie, readCameraSpin } from '@/lib/cameraSpinPref';

describe('readCameraSpin', () => {
  it('defaults to spinning when the cookie is absent', () => {
    expect(readCameraSpin('')).toBe(true);
    expect(readCameraSpin('other=1; foo=bar')).toBe(true);
  });

  it('reads the stored choice among other cookies', () => {
    expect(readCameraSpin(`a=1; ${CAMERA_SPIN_COOKIE}=0; b=2`)).toBe(false);
    expect(readCameraSpin(`${CAMERA_SPIN_COOKIE}=1`)).toBe(true);
  });
});

describe('cameraSpinCookie', () => {
  it('round-trips through readCameraSpin', () => {
    for (const enabled of [true, false]) {
      const pair = cameraSpinCookie(enabled).split(';')[0];
      expect(readCameraSpin(pair)).toBe(enabled);
    }
  });

  it('lives site-wide for a year', () => {
    expect(cameraSpinCookie(false)).toContain('path=/');
    expect(cameraSpinCookie(false)).toContain(`max-age=${60 * 60 * 24 * 365}`);
  });
});
