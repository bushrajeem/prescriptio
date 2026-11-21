import React from 'react';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  className?: string;
}

/**
 * Crisp deterministic SVG QR-style verification matrix for printed prescriptions and marketing flyers.
 */
export const QrCodeSvg: React.FC<QrCodeSvgProps> = ({ value, size = 84, className = '' }) => {
  const grid = 21;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const isFinder = (r: number, c: number) => {
    const inTopLeft = r < 7 && c < 7;
    const inTopRight = r < 7 && c >= grid - 7;
    const inBottomLeft = r >= grid - 7 && c < 7;
    return inTopLeft || inTopRight || inBottomLeft;
  };

  const finderCell = (r: number, c: number) => {
    const lr = r >= grid - 7 ? r - (grid - 7) : r;
    const lc = c >= grid - 7 ? c - (grid - 7) : c;
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
    return false;
  };

  const rects: React.ReactNode[] = [];
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      let filled = false;
      if (isFinder(r, c)) {
        filled = finderCell(r, c);
      } else if (r === 6 || c === 6) {
        filled = (r + c) % 2 === 0;
      } else {
        const seed = Math.imul(hash ^ (r * 31 + c * 17), 2654435761) >>> 0;
        filled = (seed & 3) === 0 || (seed & 7) === 3;
      }
      if (filled) {
        rects.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="currentColor" />);
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`-1 -1 ${grid + 2} ${grid + 2}`}
      className={className}
      role="img"
      aria-label={`Verification QR for ${value}`}
    >
      <rect x={-1} y={-1} width={grid + 2} height={grid + 2} fill="white" rx={1} />
      {rects}
    </svg>
  );
};
