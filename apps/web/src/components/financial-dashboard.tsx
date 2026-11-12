'use client';

import React, { useState, useEffect } from 'react';
import type {
  AccountResponse,
  CustomerResponse,
  TransferResponse,
  LedgerReconciliationResponse,
} from '@nyx/contracts';
import { StatusBadge } from './status-badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function FinancialDashboard(): React.JSX.Element {
  const [_customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [transfers, setTransfers] = useState<TransferResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reconciliationResult, setReconciliationResult] =
    useState<LedgerReconciliationResponse | null>(null);

  // Form states
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destAccountId, setDestAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('50.00');
  const [depositAmount, setDepositAmount] = useState('100.00');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async (): Promise<void> => {
    try {
      const [accRes, custRes, transRes] = await Promise.all([
        fetch(`${API_URL}/accounts`).then(r => (r.ok ? r.json() : [])),
        fetch(`${API_URL}/customers`).then(r => (r.ok ? r.json() : [])),
        fetch(`${API_URL}/transfers`).then(r => (r.ok ? r.json() : [])),
      ]);

      setAccounts(accRes);
      setCustomers(custRes);
      setTransfers(transRes);

      if (accRes.length >= 2) {
        if (!sourceAccountId) setSourceAccountId(accRes[0].id);
        if (!destAccountId) setDestAccountId(accRes[1].id);
      }
      if (accRes.length >= 1 && !depositAccountId) {
        setDepositAccountId(accRes[0].id);
      }
    } catch {
      // Handled gracefully when API is offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const handleSeedInitialData = async (): Promise<void> => {
    setSubmitting(true);
    setActionMessage(null);
    try {
      // 1. Create Customer
      const custRes = await fetch(`${API_URL}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: `jane-${Date.now()}@nyx.local`,
          documentNumber: `DOC-${Date.now()}`,
        }),
      });
      const customer: CustomerResponse = await custRes.json();

      // 2. Create Account A with $1,000.00 initial deposit
      await fetch(`${API_URL}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          currency: 'USD',
          type: 'checking',
          initialDeposit: 100000,
        }),
      });

      // 3. Create Account B with $200.00 initial deposit
      await fetch(`${API_URL}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          currency: 'USD',
          type: 'checking',
          initialDeposit: 20000,
        }),
      });

      await fetchData();
      setActionMessage('Seed customer and funded accounts created successfully');
    } catch (err) {
      setActionMessage(`Error provisioning seed data: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!sourceAccountId || !destAccountId) return;

    setSubmitting(true);
    setActionMessage(null);
    try {
      const cents = Math.round(parseFloat(transferAmount) * 100);
      const idempotencyKey = `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const res = await fetch(`${API_URL}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAccountId,
          destinationAccountId: destAccountId,
          amount: cents,
          currency: 'USD',
          idempotencyKey,
          description: `Transfer executed via console`,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message ?? 'Transfer failed');
      }

      await fetchData();
      setActionMessage('Transfer posted atomically with balanced ledger entries');
    } catch (err) {
      setActionMessage(`Transfer rejected: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDepositFunds = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!depositAccountId) return;

    setSubmitting(true);
    setActionMessage(null);
    try {
      const cents = Math.round(parseFloat(depositAmount) * 100);
      const idempotencyKey = `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const res = await fetch(`${API_URL}/accounts/${depositAccountId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cents,
          idempotencyKey,
          description: 'Console manual deposit',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message ?? 'Deposit failed');
      }

      await fetchData();
      setActionMessage('Funds deposited and double-entry ledger updated');
    } catch (err) {
      setActionMessage(`Deposit failed: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconcile = async (accountId: string): Promise<void> => {
    try {
      const res = await fetch(`${API_URL}/accounts/${accountId}/reconcile`);
      if (res.ok) {
        const data: LedgerReconciliationResponse = await res.json();
        setReconciliationResult(data);
      }
    } catch {
      // Ignore
    }
  };

  const formatMoney = (cents: number, currency = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  };

  return (
    <div className="space-y-8">
      {/* Action alerts */}
      {actionMessage && (
        <div className="p-4 rounded-md border border-zinc-700 bg-zinc-900 text-sm text-zinc-200">
          {actionMessage}
        </div>
      )}

      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h2 className="text-xl font-medium text-zinc-100">Financial Ledger and Accounts</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time balance monitoring, atomic transfers, and double-entry reconciliation
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-1.5 rounded text-xs font-medium border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
          >
            Refresh
          </button>
          {accounts.length === 0 && (
            <button
              type="button"
              onClick={handleSeedInitialData}
              disabled={submitting}
              className="px-3 py-1.5 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              Seed Sample Accounts
            </button>
          )}
        </div>
      </div>

      {/* Account Cards */}
      <section>
        <h3 className="text-sm font-mono text-zinc-500 uppercase tracking-wider mb-4">
          Active Accounts ({accounts.length})
        </h3>
        {accounts.length === 0 ? (
          <div className="p-6 rounded-lg border border-dashed border-zinc-800 text-center text-sm text-zinc-500">
            No accounts provisioned yet. Click &ldquo;Seed Sample Accounts&rdquo; above to start.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(acc => (
              <div
                key={acc.id}
                className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/60 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-mono text-zinc-400">{acc.accountNumber}</span>
                    <StatusBadge status="ok" label={acc.status.toUpperCase()} />
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-zinc-100">
                    {formatMoney(acc.balance, acc.currency)}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Type: {acc.type.toUpperCase()} | Currency: {acc.currency}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex justify-between items-center text-xs">
                  <button
                    type="button"
                    onClick={() => handleReconcile(acc.id)}
                    className="text-zinc-400 hover:text-zinc-200 underline"
                  >
                    Verify Ledger
                  </button>
                  <span className="text-zinc-600 font-mono text-[10px]">
                    ID: {acc.id.slice(0, 8)}...
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reconciliation modal/card if available */}
      {reconciliationResult && (
        <div className="p-4 rounded-lg border border-emerald-900/60 bg-emerald-950/20 text-xs text-zinc-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="font-semibold text-emerald-400">
              Ledger Reconciliation Status:{' '}
              {reconciliationResult.isReconciled ? 'BALANCED' : 'DISCREPANCY'}
            </div>
            <div className="mt-1 text-zinc-400">
              Account Balance: {formatMoney(reconciliationResult.accountBalance)} | Ledger
              Calculated: {formatMoney(reconciliationResult.ledgerDerivedBalance)} | Total Debits:{' '}
              {formatMoney(reconciliationResult.totalDebits)} | Total Credits:{' '}
              {formatMoney(reconciliationResult.totalCredits)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReconciliationResult(null)}
            className="px-2 py-1 rounded border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Forms Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Transfer Form */}
        <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/40">
          <h3 className="text-sm font-medium text-zinc-200 mb-4">Execute Atomic Transfer</h3>
          <form onSubmit={handleExecuteTransfer} className="space-y-4 text-xs">
            <div>
              <label htmlFor="sourceAccountSelect" className="block text-zinc-400 mb-1">
                Source Account
              </label>
              <select
                id="sourceAccountSelect"
                value={sourceAccountId}
                onChange={e => setSourceAccountId(e.target.value)}
                className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.accountNumber} ({formatMoney(a.balance, a.currency)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="destAccountSelect" className="block text-zinc-400 mb-1">
                Destination Account
              </label>
              <select
                id="destAccountSelect"
                value={destAccountId}
                onChange={e => setDestAccountId(e.target.value)}
                className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.accountNumber} ({formatMoney(a.balance, a.currency)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="transferAmountInput" className="block text-zinc-400 mb-1">
                Amount ($ USD)
              </label>
              <input
                id="transferAmountInput"
                type="number"
                step="0.01"
                min="0.01"
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
                className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || accounts.length < 2 || sourceAccountId === destAccountId}
              className="w-full py-2 px-4 rounded bg-zinc-100 text-zinc-900 font-medium hover:bg-zinc-200 disabled:opacity-50 transition"
            >
              {submitting ? 'Processing Transaction...' : 'Transfer Funds'}
            </button>
          </form>
        </div>

        {/* Deposit Form */}
        <div className="p-6 rounded-lg border border-zinc-800 bg-zinc-900/40">
          <h3 className="text-sm font-medium text-zinc-200 mb-4">Deposit Funds to Account</h3>
          <form onSubmit={handleDepositFunds} className="space-y-4 text-xs">
            <div>
              <label htmlFor="depositAccountSelect" className="block text-zinc-400 mb-1">
                Target Account
              </label>
              <select
                id="depositAccountSelect"
                value={depositAccountId}
                onChange={e => setDepositAccountId(e.target.value)}
                className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.accountNumber} ({formatMoney(a.balance, a.currency)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="depositAmountInput" className="block text-zinc-400 mb-1">
                Deposit Amount ($ USD)
              </label>
              <input
                id="depositAmountInput"
                type="number"
                step="0.01"
                min="0.01"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                className="w-full p-2 rounded bg-zinc-800 border border-zinc-700 text-zinc-200 focus:outline-none focus:border-zinc-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || accounts.length === 0}
              className="w-full py-2 px-4 rounded border border-zinc-700 bg-zinc-800 text-zinc-200 font-medium hover:bg-zinc-700 disabled:opacity-50 transition"
            >
              {submitting ? 'Crediting Account...' : 'Deposit Funds'}
            </button>
          </form>
        </div>
      </div>

      {/* Recent Activity Table */}
      <section>
        <h3 className="text-sm font-mono text-zinc-500 uppercase tracking-wider mb-4">
          Transfer Activity Log ({transfers.length})
        </h3>
        {transfers.length === 0 ? (
          <div className="p-6 rounded-lg border border-dashed border-zinc-800 text-center text-sm text-zinc-500">
            No transfers recorded yet.
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-500 font-mono">
                <tr>
                  <th className="p-3">TRANSFER ID</th>
                  <th className="p-3">SOURCE</th>
                  <th className="p-3">DESTINATION</th>
                  <th className="p-3">AMOUNT</th>
                  <th className="p-3">STATUS</th>
                  <th className="p-3">IDEMPOTENCY KEY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 bg-zinc-950 font-mono">
                {transfers.slice(0, 10).map(t => (
                  <tr key={t.id} className="hover:bg-zinc-900/40">
                    <td className="p-3 text-zinc-400">{t.id.slice(0, 8)}...</td>
                    <td className="p-3">{t.sourceAccountId.slice(0, 8)}...</td>
                    <td className="p-3">{t.destinationAccountId.slice(0, 8)}...</td>
                    <td className="p-3 font-semibold text-zinc-200">
                      {formatMoney(t.amount, t.currency)}
                    </td>
                    <td className="p-3">
                      <StatusBadge
                        status={t.status === 'posted' ? 'ok' : 'degraded'}
                        label={t.status.toUpperCase()}
                      />
                    </td>
                    <td className="p-3 text-zinc-500 truncate max-w-[150px]">{t.idempotencyKey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
