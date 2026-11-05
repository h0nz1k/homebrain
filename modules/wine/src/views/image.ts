/**
 * Client-side downscale of a label/bottle photo before it goes over the HA websocket
 * (the integration accepts ≤ ~3 MB; phone photos are often 5–12 MB). JPEG, EXIF dropped.
 */
export const MAX_PHOTO_EDGE = 1600;
export const MAX_PHOTO_BYTES = 3_000_000;

export type PreparePhoto = (file: Blob) => Promise<string>;

export const preparePhoto: PreparePhoto = async (file) => {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let edge = MAX_PHOTO_EDGE;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.85);
    // data URL length ≈ 4/3 of the bytes
    if (url.length * 0.75 <= MAX_PHOTO_BYTES) {
      bitmap.close?.();
      return url;
    }
    edge = Math.round(edge * 0.75);
  }
  bitmap.close?.();
  throw new Error('too-large');
};
