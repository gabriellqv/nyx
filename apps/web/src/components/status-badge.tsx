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
      bg: 'bg-nyx-card border-nyx-border',
      text: 'text-nyx-highlight',
      dot: 'bg-nyx-highlight',
    },
    degraded: {
      bg: 'bg-[#252238] border-[#4a4266]',
      text: 'text-[#d4c7f5]',
      dot: 'bg-[#9d84d6]',
    },
    error: {
      bg: 'bg-[#2a1b2e] border-[#5e2b4e]',
      text: 'text-[#f2a8c9]',
      dot: 'bg-[#e65c8a]',
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
