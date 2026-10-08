import { describe, expect, it } from 'vitest';
import { hdFilePath } from '@/lib/hdFiles';

describe('hdFilePath', () => {
  it('names a KTX2 file under hd/', () => {
    expect(hdFilePath('/app', ['stars', 'MilkyWay-extreme.ktx2'])).toBe('/app/hd/stars/MilkyWay-extreme.ktx2');
  });

  it('refuses anything outside hd/', () => {
    expect(hdFilePath('/app', ['..', 'package.json'])).toBeNull();
    expect(hdFilePath('/app', ['..', '..', 'etc', 'x.ktx2'])).toBeNull();
    expect(hdFilePath('/app', [])).toBeNull();
  });

  it('refuses anything but KTX2', () => {
    expect(hdFilePath('/app', ['stars', 'notes.txt'])).toBeNull();
  });
});
