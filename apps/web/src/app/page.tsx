import React from 'react';
import { StatusBadge } from '../components/status-badge';

export default function HomePage(): React.JSX.Element {
  return (
    <main className="min-h-screen px-6 py-12 max-w-5xl mx-auto flex flex-col justify-between">
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

      <section className="py-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
            Ledger Subsystem
          </div>
          <div className="mt-2 text-lg font-medium text-zinc-200">Double-Entry Accounting</div>
          <p className="mt-2 text-sm text-zinc-400">
            Immutable transaction records enforcing balanced debit and credit entries with exact
            decimal precision.
          </p>
        </div>

        <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
            Transfer Subsystem
          </div>
          <div className="mt-2 text-lg font-medium text-zinc-200">Atomic Operations</div>
          <p className="mt-2 text-sm text-zinc-400">
            Isolated execution boundaries with persisted idempotency keys and database concurrency
            locks.
          </p>
        </div>

        <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
            Architecture
          </div>
          <div className="mt-2 text-lg font-medium text-zinc-200">Modular Monolith</div>
          <p className="mt-2 text-sm text-zinc-400">
            Clean Architecture boundary isolation with shared Zod contracts across frontend and
            backend services.
          </p>
        </div>
      </section>

      <footer className="border-t border-zinc-800 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 font-mono">
        <div>NYX Infrastructure v0.1.0</div>
        <div className="mt-2 sm:mt-0">PostgreSQL 16 | NestJS | Next.js</div>
      </footer>
    </main>
  );
}
