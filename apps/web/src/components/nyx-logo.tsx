import React, { useId } from 'react';

interface NyxLogoProps extends React.SVGProps<SVGSVGElement> {
  height?: number;
  variant?: 'wordmark' | 'mark';
  className?: string;
}

/**
 * Modern geometric vector logo for Nyx Core Banking & Ledger.
 * Constructed exclusively from custom typographic letterforms (N, Y, X)
 * with atomic intersection detailing and brand token illumination.
 */
export function NyxLogo({
  height = 24,
  variant = 'wordmark',
  className = '',
  ...props
}: NyxLogoProps): React.JSX.Element {
  const rawId = useId();
  const gradId = `nyx-accent-${rawId.replace(/[:/]/g, '')}`;

  if (variant === 'mark') {
    // Compact Monogram 'N' (aspect ratio 1:1, viewBox 0 0 24 24)
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        height={height}
        width={height}
        className={`shrink-0 ${className}`}
        aria-label="Nyx mark"
        role="img"
        {...props}
      >
        <path d="M 1 1 h 5.5 l 11 15.5 V 1 h 5.5 v 22 h -5.5 L 6.5 7.5 V 23 H 1 Z" fill="#E5E0F0" />
        {/* Subtle accent highlight at the terminus of the diagonal */}
        <polygon points="17.5,16.5 23,23 17.5,23" fill="#B8A5E8" />
      </svg>
    );
  }

  // Full Wordmark 'NYX' (viewBox 0 0 80 24)
  const width = Math.round((height * 80) / 24);

  return (
    <svg
      viewBox="0 0 80 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      height={height}
      width={width}
      className={`shrink-0 ${className}`}
      aria-label="Nyx logo"
      role="img"
      {...props}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#D6C8F8" />
          <stop offset="100%" stopColor="#B8A5E8" />
        </linearGradient>
      </defs>

      {/* Letter 'N' */}
      <path d="M 0 0 h 5.5 l 11 15.5 V 0 h 5.5 v 24 h -5.5 L 5.5 8.5 V 24 H 0 Z" fill="#E5E0F0" />

      {/* Letter 'Y' */}
      <path
        d="M 28 0 h 5.8 L 39 9.8 L 44.2 0 H 50 L 41.6 13 V 24 h -5.2 V 13 L 28 0 Z"
        fill="#E5E0F0"
      />

      {/* Letter 'X' - Main descent stroke */}
      <polygon points="56,0 61.8,0 78,24 72.2,24" fill="#E5E0F0" />

      {/* Letter 'X' - Ascending cross-stroke with atomic ledger intersection gap */}
      {/* Upper arm */}
      <polygon points="72.2,0 78,0 71.925,9 66.125,9" fill={`url(#${gradId})`} />
      {/* Lower arm */}
      <polygon points="62.075,15 67.875,15 61.8,24 56,24" fill={`url(#${gradId})`} />
    </svg>
  );
}
