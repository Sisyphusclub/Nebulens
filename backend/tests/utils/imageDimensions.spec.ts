import { describe, expect, it } from 'vitest';

import { readImageDimensions } from '../../src/utils/imageDimensions.js';

describe('readImageDimensions', () => {
  it('reads PNG IHDR dimensions', () => {
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(buffer);
    buffer.write('IHDR', 12, 'ascii');
    buffer.writeUInt32BE(3840, 16);
    buffer.writeUInt32BE(2304, 20);

    expect(readImageDimensions(buffer)).toEqual({ width: 3840, height: 2304 });
  });

  it('reads JPEG start-of-frame dimensions after metadata segments', () => {
    const buffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x09, 0x00,
      0x0f, 0x00, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    ]);

    expect(readImageDimensions(buffer)).toEqual({ width: 3840, height: 2304 });
  });

  it('reads extended WebP canvas dimensions', () => {
    const buffer = Buffer.alloc(30);
    buffer.write('RIFF', 0, 'ascii');
    buffer.write('WEBP', 8, 'ascii');
    buffer.write('VP8X', 12, 'ascii');
    buffer.writeUIntLE(3839, 24, 3);
    buffer.writeUIntLE(2303, 27, 3);

    expect(readImageDimensions(buffer)).toEqual({ width: 3840, height: 2304 });
  });

  it('returns null for unsupported or malformed bytes', () => {
    expect(readImageDimensions(Buffer.from('not an image'))).toBeNull();
    expect(readImageDimensions(Buffer.alloc(24))).toBeNull();
  });
});
