import React from 'react';
import { FinancialDashboard } from '../components/financial-dashboard';
import { StatusBadge } from '../components/status-badge';

export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen px-6 py-12 max-w-6xl mx-auto flex flex-col justify-between">
      <header className="border-b border-zinc-800 pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">NYX Platform</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Financial infrastructure platform with double-entry ledger and atomic transfer
            guarantees
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 font-mono">CORE STATUS:</span>
          <StatusBadge status="ok" label="OPERATIONAL" />
        </div>
      </header>

      <section className="py-8">
        <FinancialDashboard />
      </section>

      <footer className="border-t border-zinc-800 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 font-mono">
        <div>NYX Infrastructure v0.2.0 (Phase 2: Core Financial Domain)</div>
        <div className="mt-2 sm:mt-0">PostgreSQL 16 | NestJS | Next.js</div>
      </footer>
    </main>
  );
}
