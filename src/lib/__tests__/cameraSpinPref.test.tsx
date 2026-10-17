import { beforeEach, describe, expect, it } from 'vitest';
import { CAMERA_SPIN_KEY, readCameraSpin, saveCameraSpin } from '@/lib/cameraSpinPref';

beforeEach(() => localStorage.clear());

describe('cameraSpinPref', () => {
  it('defaults to spinning', () => {
    expect(readCameraSpin('')).toBe(true);
  });

  it('remembers the choice on the device, not in a cookie (the Steam and iOS apps keep no cookies)', () => {
    saveCameraSpin(false);
    expect(localStorage.getItem(CAMERA_SPIN_KEY)).toBe('0');
    expect(readCameraSpin('')).toBe(false);
    saveCameraSpin(true);
    expect(readCameraSpin('')).toBe(true);
  });

  it('still reads an old cookie when nothing is stored yet', () => {
    expect(readCameraSpin('other=1; wom_camera_spin=0')).toBe(false);
    expect(readCameraSpin('wom_camera_spin=1')).toBe(true);
    saveCameraSpin(true);
    expect(readCameraSpin('wom_camera_spin=0')).toBe(true); // the stored choice wins
  });
});
