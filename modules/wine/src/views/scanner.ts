/**
 * EAN scanning for the add sheet: native BarcodeDetector where available (Android Chrome,
 * HA companion app), otherwise a lazily loaded ZXing 1D reader (own chunk – never part of
 * the panel's main bundle). Both read from a canvas frame so the loop is identical.
 */
import { normalizeEan } from '../lookup.js';

export interface FrameDecoder {
  kind: 'native' | 'zxing';
  decode(source: HTMLCanvasElement): Promise<string | null>;
}

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
interface NativeDetectorCtor {
  new (options?: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

async function nativeDecoder(): Promise<FrameDecoder | null> {
  const Ctor = (globalThis as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? FORMATS;
    const formats = FORMATS.filter((f) => supported.includes(f));
    if (!formats.length) return null;
    const detector = new Ctor({ formats });
    return {
      kind: 'native',
      decode: async (canvas) => {
        const hits = await detector.detect(canvas);
        for (const h of hits) {
          const ean = normalizeEan(h.rawValue);
          if (ean) return ean;
        }
        return null;
      },
    };
  } catch {
    return null;
  }
}

async function zxingDecoder(): Promise<FrameDecoder> {
  // Deep imports: only the UPC/EAN readers (the package index would pull every format).
  const [
    { default: MultiFormatUPCEANReader },
    { default: BinaryBitmap },
    { default: HybridBinarizer },
    { default: RGBLuminanceSource },
    { default: DecodeHintType },
  ] = await Promise.all([
    import('@zxing/library/esm/core/oned/MultiFormatUPCEANReader'),
    import('@zxing/library/esm/core/BinaryBitmap'),
    import('@zxing/library/esm/core/common/HybridBinarizer'),
    import('@zxing/library/esm/core/RGBLuminanceSource'),
    import('@zxing/library/esm/core/DecodeHintType'),
  ]);
  const hints = new Map([[DecodeHintType.TRY_HARDER, true]]);
  const reader = new MultiFormatUPCEANReader(hints);
  return {
    kind: 'zxing',
    decode: async (canvas) => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      const { width, height } = canvas;
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const lum = new Uint8ClampedArray(width * height);
      for (let i = 0, j = 0; j < lum.length; i += 4, j += 1)
        lum[j] = (rgba[i]! * 77 + rgba[i + 1]! * 150 + rgba[i + 2]! * 29) >> 8;
      try {
        const bitmap = new BinaryBitmap(
          new HybridBinarizer(new RGBLuminanceSource(lum, width, height)),
        );
        return normalizeEan(reader.decode(bitmap, hints).getText());
      } catch {
        return null; // NotFound / checksum / format – just try the next frame
      } finally {
        reader.reset();
      }
    },
  };
}

let cached: Promise<FrameDecoder> | null = null;
/** Native detector first, ZXing fallback (loaded on first use only). */
export function getDecoder(): Promise<FrameDecoder> {
  cached ??= nativeDecoder().then((d) => d ?? zxingDecoder());
  cached.catch(() => (cached = null));
  return cached;
}

export type CameraError = 'denied' | 'unavailable' | 'insecure' | 'failed';
export function cameraError(err: unknown): CameraError {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unavailable';
  return 'failed';
}
export const CAMERA_ERROR_CS: Record<CameraError, string> = {
  denied:
    'Přístup ke kameře je zakázaný. Povolte ho v nastavení prohlížeče nebo aplikace Home Assistant, nebo zadejte EAN ručně.',
  unavailable: 'Kamera nebyla nalezena. Zadejte EAN ručně nebo nahrajte fotku čárového kódu.',
  insecure: 'Kamera funguje jen přes HTTPS. Zadejte EAN ručně nebo nahrajte fotku čárového kódu.',
  failed: 'Kameru se nepodařilo spustit. Zadejte EAN ručně.',
};

export async function openCamera(): Promise<MediaStream> {
  const media = globalThis.navigator?.mediaDevices;
  if (!media?.getUserMedia) {
    throw Object.assign(new Error('insecure'), {
      name: globalThis.isSecureContext === false ? 'InsecureContext' : 'NotFoundError',
    });
  }
  return media.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
  });
}

/** Decode a still photo of a barcode (file input fallback when live video is not possible). */
export async function decodeImageFile(file: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return (await getDecoder()).decode(canvas);
}
