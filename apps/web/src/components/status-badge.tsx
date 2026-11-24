import React from 'react';
import type { HealthStatus } from '@nyx/contracts';
import { cn } from '../lib/utils';

export type ExtendedStatus = HealthStatus | 'settled' | 'pending' | 'balanced' | 'discrepant';

interface StatusBadgeProps {
  status: ExtendedStatus;
  label?: string;
  className?: string;
}

/**
 * Visual operational status badge.
 */
export function StatusBadge({
  status,
  label,
  className = '',
}: StatusBadgeProps): React.JSX.Element {
  const statusStyles: Record<
    ExtendedStatus,
    { bg: string; text: string; dot: string; defaultLabel: string }
  > = {
    ok: {
      bg: 'bg-[#191b35] border-[#302c45]',
      text: 'text-[#b8a5e8]',
      dot: 'bg-[#b8a5e8]',
      defaultLabel: 'Operational',
    },
    balanced: {
      bg: 'bg-[#142328] border-[#224840]',
      text: 'text-[#4ade80]',
      dot: 'bg-[#4ade80]',
      defaultLabel: 'Balanced',
    },
    settled: {
      bg: 'bg-[#142328] border-[#224840]',
      text: 'text-[#4ade80]',
      dot: 'bg-[#4ade80]',
      defaultLabel: 'Settled',
    },
    pending: {
      bg: 'bg-[#292218] border-[#523d24]',
      text: 'text-[#fbbf24]',
      dot: 'bg-[#d97706]',
      defaultLabel: 'Pending',
    },
    degraded: {
      bg: 'bg-[#261e2f] border-[#4a365f]',
      text: 'text-[#d8b4fe]',
      dot: 'bg-[#b8a5e8]',
      defaultLabel: 'Degraded',
    },
    error: {
      bg: 'bg-[#2d1622] border-[#5e223f]',
      text: 'text-[#f87171]',
      dot: 'bg-[#e11d48]',
      defaultLabel: 'Error',
    },
    discrepant: {
      bg: 'bg-[#2d1622] border-[#5e223f]',
      text: 'text-[#f87171]',
      dot: 'bg-[#e11d48]',
      defaultLabel: 'Discrepant',
    },
  };

  const current = statusStyles[status] ?? statusStyles.error;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border',
        current.bg,
        current.text,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', current.dot)} />
      <span>{label ?? current.defaultLabel}</span>
    </span>
  );
}
