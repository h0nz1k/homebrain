import { useMemo } from 'react';
import { encodeQr, qrPath } from './qr.js';

export interface QrCodeProps {
  /** Payload, e.g. `WIFI:T:WPA;S:…;P:…;;`. */
  value: string;
  /** Accessible name (the payload itself may contain a password – never use it as the label). */
  label: string;
  size?: number;
  className?: string;
}

/** Scannable QR code as crisp SVG (dark modules on a light tile, also in the dark theme). */
export function QrCode({ value, label, size = 200, className = '' }: QrCodeProps) {
  const matrix = useMemo(() => encodeQr(value), [value]);
  if (!matrix) return null;
  const dim = matrix.length + 8;
  return (
    <svg
      className={`hb-qr ${className}`}
      role="img"
      aria-label={label}
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
    >
      <rect width={dim} height={dim} rx="2" fill="#fff" />
      <path d={qrPath(matrix)} fill="#0b0f17" />
    </svg>
  );
}
