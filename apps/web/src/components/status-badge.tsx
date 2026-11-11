import React from 'react';
import type { HealthStatus } from '@nyx/contracts';
import { cn } from '../lib/utils';

interface StatusBadgeProps {
  status: HealthStatus;
  label?: string;
}

/**
 * Visual status badge displaying operational states.
 */
export function StatusBadge({ status, label }: StatusBadgeProps): React.JSX.Element {
  const statusStyles: Record<HealthStatus, { bg: string; text: string; dot: string }> = {
    ok: {
      bg: 'bg-emerald-950/40 border-emerald-800/60',
      text: 'text-emerald-300',
      dot: 'bg-emerald-400',
    },
    degraded: {
      bg: 'bg-amber-950/40 border-amber-800/60',
      text: 'text-amber-300',
      dot: 'bg-amber-400',
    },
    error: {
      bg: 'bg-rose-950/40 border-rose-800/60',
      text: 'text-rose-300',
      dot: 'bg-rose-400',
    },
  };

  const current = statusStyles[status] ?? statusStyles.error;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
        current.bg,
        current.text,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', current.dot)} />
      {label ?? status.toUpperCase()}
    </span>
  );
}
