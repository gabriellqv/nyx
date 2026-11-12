import React from 'react';
import { FinancialDashboard } from '../components/financial-dashboard';
import { StatusBadge } from '../components/status-badge';

export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen px-6 py-12 max-w-6xl mx-auto flex flex-col justify-between">
      <header className="border-b border-nyx-border pb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-nyx-text">NYX Platform</h1>
          <p className="text-sm text-nyx-muted mt-1">
            Financial infrastructure platform with double-entry ledger and atomic transfer
            guarantees
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-nyx-muted font-mono">CORE STATUS:</span>
          <StatusBadge status="ok" label="OPERATIONAL" />
        </div>
      </header>

      <section className="py-8">
        <FinancialDashboard />
      </section>

      <footer className="border-t border-nyx-border pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-nyx-muted font-mono">
        <div>NYX Infrastructure v0.5.0</div>
        <div className="mt-2 sm:mt-0">PostgreSQL 16 | NestJS | Next.js</div>
      </footer>
    </main>
  );
}
