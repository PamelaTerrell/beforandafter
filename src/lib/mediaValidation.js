export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function validateImageFile(file) {
  if (!file) return 'Choose an image.';
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return 'Choose a JPEG, PNG, or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return 'Image must be 20 MB or smaller.';
  return null;
}
