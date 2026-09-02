import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, validateImageFile } from './mediaValidation';

describe('validateImageFile', () => {
  it('accepts supported image types within the size limit', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1024 })).toBeNull();
    expect(validateImageFile({ type: 'image/png', size: 1024 })).toBeNull();
    expect(validateImageFile({ type: 'image/webp', size: 1024 })).toBeNull();
  });

  it('rejects SVG and other executable or unsupported content types', () => {
    expect(validateImageFile({ type: 'image/svg+xml', size: 1024 })).toMatch(/JPEG/);
    expect(validateImageFile({ type: 'text/html', size: 1024 })).toMatch(/JPEG/);
  });

  it('rejects oversized images', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 })).toMatch(/20 MB/);
  });
});
