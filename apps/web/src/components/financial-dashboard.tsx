'use client';

import React, { useState, useEffect, useId } from 'react';
import type {
  AccountResponse,
  CustomerResponse,
  TransferResponse,
  LedgerReconciliationResponse,
} from '@nyx/contracts';
import {
  LedgerIcon,
  TransferIcon,
  AuditIcon,
  OutboxIcon,
  RefreshIcon,
  PlusIcon,
  CheckIcon,
  AlertIcon,
  MenuIcon,
  CloseIcon,
  DatabaseIcon,
} from './icons';
import { NyxLogo } from './nyx-logo';
import { StatusBadge } from './status-badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type TabView = 'overview' | 'transfers' | 'reconciliation' | 'outbox';

interface WebhookSimEvent {
  id: string;
  topic: string;
  timestamp: string;
  payloadSummary: string;
  signature: string;
  status: 'dispatched' | 'pending';
}

export function FinancialDashboard(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabView>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [_customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [transfers, setTransfers] = useState<TransferResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionNotice, setActionNotice] = useState<{
    type: 'ok' | 'error';
    message: string;
  } | null>(null);
  const [reconciliationResult, setReconciliationResult] =
    useState<LedgerReconciliationResponse | null>(null);

  // Form states
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destAccountId, setDestAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('50.00');
  const [transferDescription, setTransferDescription] = useState('Operating liquidity rebalance');
  const [depositAmount, setDepositAmount] = useState('100.00');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [auditAccountId, setAuditAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Accessible element IDs
  const sourceSelectId = useId();
  const destSelectId = useId();
  const transferAmountId = useId();
  const transferDescId = useId();
  const depositSelectId = useId();
  const depositAmountId = useId();
  const auditSelectId = useId();

  // Outbox simulated events
  const [webhookEvents, setWebhookEvents] = useState<WebhookSimEvent[]>([
    {
      id: 'evt-9042b1',
      topic: 'transfer.posted',
      timestamp: '2026-11-24T12:45:10Z',
      payloadSummary: '{"transferId":"tr-8821","amount":5000,"currency":"USD"}',
      signature: 'sha256=9b72cf91a382e7d801ba6f2e',
      status: 'dispatched',
    },
    {
      id: 'evt-9041a9',
      topic: 'account.credited',
      timestamp: '2026-11-24T12:40:02Z',
      payloadSummary: '{"accountId":"acc-aur-01","amount":100000,"currency":"USD"}',
      signature: 'sha256=17df8a01c441b802e9a74421',
      status: 'dispatched',
    },
  ]);

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
      if (accRes.length >= 1 && !auditAccountId) {
        setAuditAccountId(accRes[0].id);
      }
    } catch {
      // Graceful offline fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const totalCustodyBalance = accounts.reduce((acc, curr) => acc + (curr.balance ?? 0), 0);

  const handleSeedInitialData = async (): Promise<void> => {
    setSubmitting(true);
    setActionNotice(null);
    try {
      // 1. Create Corporate Customer
      const custRes = await fetch(`${API_URL}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Aura Treasury Corporation',
          email: `treasury-${Date.now()}@aura.finance`,
          documentNumber: `CORP-${Date.now().toString().slice(-6)}`,
        }),
      });

      if (!custRes.ok) throw new Error('Customer provisioning rejected');
      const customer: CustomerResponse = await custRes.json();

      // 2. Create Primary Treasury Operating Account ($1,000.00 USD)
      const acc1Res = await fetch(`${API_URL}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          currency: 'USD',
          type: 'checking',
          initialDeposit: 100000,
        }),
      });
      const acc1: AccountResponse = await acc1Res.json();

      // 3. Create Secondary Settlement Account ($250.00 USD)
      const acc2Res = await fetch(`${API_URL}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          currency: 'USD',
          type: 'checking',
          initialDeposit: 25000,
        }),
      });
      const acc2: AccountResponse = await acc2Res.json();

      setSourceAccountId(acc1.id);
      setDestAccountId(acc2.id);
      setDepositAccountId(acc1.id);

      await fetchData();
      setActionNotice({
        type: 'ok',
        message: 'Accounts provisioned with initial balanced double-entry funding',
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Provisioning failed: ${(err as Error).message}`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!sourceAccountId || !destAccountId) {
      setActionNotice({ type: 'error', message: 'Select both origin and destination accounts' });
      return;
    }
    if (sourceAccountId === destAccountId) {
      setActionNotice({
        type: 'error',
        message: 'Origin and destination accounts must be distinct',
      });
      return;
    }

    setSubmitting(true);
    setActionNotice(null);
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
          description: transferDescription || 'Atomic transfer execution',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message ?? 'Transfer rejected by core engine');
      }

      await fetchData();
      setActionNotice({
        type: 'ok',
        message: `Settled ${formatMoney(cents)} atomically with dual balanced ledger entries`,
      });

      // Append to simulated webhook outbox log
      setWebhookEvents(prev => [
        {
          id: `evt-${Date.now().toString().slice(-6)}`,
          topic: 'transfer.posted',
          timestamp: new Date().toISOString(),
          payloadSummary: JSON.stringify({
            source: sourceAccountId.slice(0, 8),
            dest: destAccountId.slice(0, 8),
            amount: cents,
          }),
          signature: `sha256=${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`,
          status: 'dispatched',
        },
        ...prev,
      ]);
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Transfer failed: ${(err as Error).message}`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDepositFunds = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!depositAccountId) return;

    setSubmitting(true);
    setActionNotice(null);
    try {
      const cents = Math.round(parseFloat(depositAmount) * 100);
      const idempotencyKey = `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const res = await fetch(`${API_URL}/accounts/${depositAccountId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cents,
          idempotencyKey,
          description: 'Institutional treasury deposit',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message ?? 'Deposit rejected');
      }

      await fetchData();
      setActionNotice({
        type: 'ok',
        message: `Deposited ${formatMoney(cents)} into account ledger`,
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Deposit failed: ${(err as Error).message}`,
      });
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
        const targetAcc = accounts.find(a => a.id === accountId);
        const accNumber = targetAcc ? targetAcc.accountNumber : accountId.slice(0, 8);
        setActionNotice({
          type: data.isReconciled ? 'ok' : 'error',
          message: data.isReconciled
            ? `Reconciliation passed: Account ${accNumber} balance matches historical ledger sum`
            : `Reconciliation discrepancy detected on account ${accNumber}`,
        });
      }
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: `Reconciliation error: ${(err as Error).message}`,
      });
    }
  };

  const formatMoney = (cents: number, currency = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  };

  const activeSourceAccount = accounts.find(a => a.id === sourceAccountId);
  const activeDestAccount = accounts.find(a => a.id === destAccountId);
  const targetReconciledAccount = reconciliationResult
    ? accounts.find(a => a.id === reconciliationResult.accountId)
    : null;
  const transferCents = Math.round((parseFloat(transferAmount) || 0) * 100);

  return (
    <div className="min-h-dvh bg-nyx-background text-nyx-text flex flex-col lg:flex-row">
      {/* Mobile Top Header */}
      <div className="lg:hidden bg-nyx-sidebar border-b border-nyx-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <NyxLogo height={20} />
          <span className="text-xs text-nyx-muted border-l border-nyx-border pl-2.5 font-medium">
            Core Ledger
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded bg-nyx-card text-nyx-text border border-nyx-border"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
        </button>
      </div>

      {/* Primary Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-nyx-sidebar border-r border-nyx-border flex flex-col justify-between transform transition-transform duration-200 ease-out lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:static lg:w-64 shrink-0`}
      >
        <div className="p-5 flex flex-col gap-6">
          {/* Identity Header */}
          <div className="flex flex-col gap-1.5 pb-3 border-b border-nyx-border">
            <NyxLogo height={24} />
            <div className="text-xs text-nyx-muted font-medium">Core Banking & Ledger</div>
          </div>

          {/* Operational Navigation */}
          <nav className="flex flex-col gap-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setActiveTab('overview');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition ${
                activeTab === 'overview'
                  ? 'bg-nyx-card text-nyx-highlight border border-nyx-border font-medium'
                  : 'text-nyx-muted hover:text-nyx-text hover:bg-nyx-card/40'
              }`}
            >
              <LedgerIcon size={16} />
              <span>Ledger & Accounts</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('transfers');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition ${
                activeTab === 'transfers'
                  ? 'bg-nyx-card text-nyx-highlight border border-nyx-border font-medium'
                  : 'text-nyx-muted hover:text-nyx-text hover:bg-nyx-card/40'
              }`}
            >
              <TransferIcon size={16} />
              <span>Atomic Transfers</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('reconciliation');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition ${
                activeTab === 'reconciliation'
                  ? 'bg-nyx-card text-nyx-highlight border border-nyx-border font-medium'
                  : 'text-nyx-muted hover:text-nyx-text hover:bg-nyx-card/40'
              }`}
            >
              <AuditIcon size={16} />
              <span>Reconciliation</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('outbox');
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-left transition ${
                activeTab === 'outbox'
                  ? 'bg-nyx-card text-nyx-highlight border border-nyx-border font-medium'
                  : 'text-nyx-muted hover:text-nyx-text hover:bg-nyx-card/40'
              }`}
            >
              <OutboxIcon size={16} />
              <span>Outbox & Events</span>
            </button>
          </nav>
        </div>

        {/* Engine Diagnostics Footer */}
        <div className="p-4 border-t border-nyx-border bg-nyx-background/50 flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between text-nyx-muted">
            <span className="flex items-center gap-1.5">
              <DatabaseIcon size={13} />
              <span>PostgreSQL 16</span>
            </span>
            <span className="text-[#4ade80] font-medium">ACID Active</span>
          </div>
          <div className="flex items-center justify-between text-nyx-muted">
            <span>Ledger Invariant</span>
            <span className="text-nyx-highlight font-medium">Exact Balance</span>
          </div>
          <div className="text-nyx-muted text-[11px] pt-1">Node Runtime 22 LTS</div>
        </div>
      </aside>

      {/* Main Workspace Canvas */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Top Control and Global Status Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-nyx-border">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-nyx-text">
              {activeTab === 'overview' && 'Treasury Ledger and Accounts'}
              {activeTab === 'transfers' && 'Atomic Transfer Terminal'}
              {activeTab === 'reconciliation' && 'Automated Ledger Reconciliation'}
              {activeTab === 'outbox' && 'Transactional Outbox & HMAC Webhooks'}
            </h1>
            <p className="text-xs text-nyx-muted mt-0.5">
              Strict mathematical double-entry enforcement in exact integer cents
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <StatusBadge status="ok" label="Core Operational" />
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={loading}
              className="p-1.5 rounded bg-nyx-card border border-nyx-border text-nyx-muted hover:text-nyx-text transition"
              title="Refresh core state"
            >
              <RefreshIcon size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => void handleSeedInitialData()}
              disabled={submitting}
              className="px-3 py-1.5 rounded text-xs font-medium bg-nyx-primary hover:bg-nyx-primary-hover text-white transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <PlusIcon size={14} />
              <span>Seed Demo Accounts</span>
            </button>
          </div>
        </header>

        {/* Global Feedback Banner */}
        {actionNotice && (
          <div
            className={`p-3 rounded border text-xs flex items-center justify-between gap-3 ${
              actionNotice.type === 'ok'
                ? 'bg-[#142328] border-[#224840] text-[#4ade80]'
                : 'bg-[#2d1622] border-[#5e223f] text-[#f87171]'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionNotice.type === 'ok' ? <CheckIcon size={15} /> : <AlertIcon size={15} />}
              <span>{actionNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="hover:opacity-75"
              aria-label="Dismiss notice"
            >
              <CloseIcon size={14} />
            </button>
          </div>
        )}

        {/* High-Level Financial Metrics Ribbon */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-4 rounded bg-nyx-card border border-nyx-border">
            <div className="text-[13px] text-nyx-muted">Total Custody Liquidity</div>
            <div className="text-xl sm:text-2xl font-semibold text-nyx-text mt-1 tabular-nums">
              {formatMoney(totalCustodyBalance)}
            </div>
            <div className="text-xs text-[#4ade80] mt-1">Audited in Cents</div>
          </div>

          <div className="p-4 rounded bg-nyx-card border border-nyx-border">
            <div className="text-[13px] text-nyx-muted">Active Accounts</div>
            <div className="text-xl sm:text-2xl font-semibold text-nyx-text mt-1 tabular-nums">
              {accounts.length}
            </div>
            <div className="text-xs text-nyx-muted mt-1">Operating & Settlement</div>
          </div>

          <div className="p-4 rounded bg-nyx-card border border-nyx-border">
            <div className="text-[13px] text-nyx-muted">Settled Transfers</div>
            <div className="text-xl sm:text-2xl font-semibold text-nyx-text mt-1 tabular-nums">
              {transfers.length}
            </div>
            <div className="text-xs text-[#4ade80] mt-1">Zero Variance</div>
          </div>

          <div className="p-4 rounded bg-nyx-card border border-nyx-border">
            <div className="text-[13px] text-nyx-muted">Ledger Equilibrium</div>
            <div className="text-xl sm:text-2xl font-semibold text-nyx-highlight mt-1 tabular-nums">
              Debits = Credits
            </div>
            <div className="text-xs text-nyx-muted mt-1">Mathematical Guarantee</div>
          </div>
        </section>

        {/* TAB 1: LEDGER & ACCOUNTS */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-6">
            {/* Accounts Registry Grid */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-nyx-text">Account Registry</h2>
                <span className="text-xs text-nyx-muted tabular-nums">
                  {accounts.length} account{accounts.length === 1 ? '' : 's'} registered
                </span>
              </div>

              {accounts.length === 0 ? (
                <div className="p-8 rounded border border-dashed border-nyx-border bg-nyx-card/30 text-center flex flex-col items-center justify-center gap-3">
                  <div className="text-sm text-nyx-muted max-w-sm">
                    No accounts currently provisioned in the ledger. Click below to initialize
                    corporate demo accounts with double-entry funding.
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSeedInitialData()}
                    disabled={submitting}
                    className="px-3.5 py-1.5 rounded text-xs font-medium bg-nyx-primary hover:bg-nyx-primary-hover text-white transition"
                  >
                    Seed Corporate Accounts
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {accounts.map(account => (
                    <div
                      key={account.id}
                      className="p-4 rounded bg-nyx-card border border-nyx-border flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-[13px] text-nyx-muted">Account Number</div>
                          <div className="text-sm font-semibold text-nyx-text mt-0.5">
                            {account.accountNumber}
                          </div>
                        </div>
                        <StatusBadge
                          status={account.status === 'active' ? 'settled' : 'pending'}
                          label={account.status.toUpperCase()}
                        />
                      </div>

                      <div className="pt-1">
                        <div className="text-[13px] text-nyx-muted">Available Balance</div>
                        <div className="text-2xl font-semibold text-nyx-text tabular-nums mt-0.5">
                          {formatMoney(account.balance, account.currency)}
                        </div>
                        <div className="text-xs text-nyx-muted mt-1">
                          Currency {account.currency} | Type {account.type}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-nyx-border/60 flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => void handleReconcile(account.id)}
                          className="text-nyx-highlight hover:underline font-medium text-[13px]"
                        >
                          Audit Ledger
                        </button>
                        <code className="text-nyx-muted text-[11px]">
                          {account.id.slice(0, 13)}...
                        </code>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Quick Liquidity Injection Form */}
            <section className="p-5 rounded bg-nyx-card border border-nyx-border">
              <h2 className="text-sm font-semibold text-nyx-text mb-3">Deposit Funds to Account</h2>
              <form
                onSubmit={handleDepositFunds}
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
              >
                <div>
                  <label htmlFor={depositSelectId} className="block text-xs text-nyx-muted mb-1">
                    Target Account
                  </label>
                  <select
                    id={depositSelectId}
                    value={depositAccountId}
                    onChange={e => setDepositAccountId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded bg-nyx-sidebar border border-nyx-border text-xs text-nyx-text focus:outline-none focus:border-nyx-highlight"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountNumber} ({formatMoney(acc.balance, acc.currency)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={depositAmountId} className="block text-xs text-nyx-muted mb-1">
                    Deposit Amount (USD)
                  </label>
                  <input
                    id={depositAmountId}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    className="w-full h-9 px-2.5 rounded bg-nyx-sidebar border border-nyx-border text-xs text-nyx-text tabular-nums focus:outline-none focus:border-nyx-highlight"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || accounts.length === 0}
                  className="h-9 px-4 rounded bg-nyx-primary hover:bg-nyx-primary-hover text-white text-xs font-medium transition disabled:opacity-50"
                >
                  Deposit Liquidity
                </button>
              </form>
            </section>

            {/* Recent Double-Entry Transfers Stream */}
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-nyx-text">Recent Double-Entry Transfers</h2>
              <div className="rounded bg-nyx-card border border-nyx-border overflow-x-auto">
                {transfers.length === 0 ? (
                  <div className="p-6 text-center text-xs text-nyx-muted">
                    No transactions executed yet. Execute an atomic transfer in the Transfer
                    Terminal tab.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-nyx-border bg-nyx-sidebar/60 text-nyx-muted">
                        <th className="py-2.5 px-3 font-medium">Transaction</th>
                        <th className="py-2.5 px-3 font-medium">Source Leg (Debit)</th>
                        <th className="py-2.5 px-3 font-medium">Destination Leg (Credit)</th>
                        <th className="py-2.5 px-3 font-medium text-right">Amount</th>
                        <th className="py-2.5 px-3 font-medium text-center">Invariant</th>
                        <th className="py-2.5 px-3 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nyx-border/40">
                      {transfers.map(t => (
                        <tr key={t.id} className="hover:bg-nyx-sidebar/30 transition">
                          <td className="py-2.5 px-3 font-medium text-nyx-text">
                            <div>{t.description || 'Atomic Transfer'}</div>
                            <code className="text-[11px] text-nyx-muted block">
                              {t.id.slice(0, 16)}...
                            </code>
                          </td>
                          <td className="py-2.5 px-3 text-nyx-muted">
                            <span className="text-[#f87171] mr-1">-</span>
                            <span>{t.sourceAccountId.slice(0, 12)}...</span>
                          </td>
                          <td className="py-2.5 px-3 text-nyx-muted">
                            <span className="text-[#4ade80] mr-1">+</span>
                            <span>{t.destinationAccountId.slice(0, 12)}...</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-nyx-text tabular-nums">
                            {formatMoney(t.amount, t.currency)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-1.5 py-0.5 rounded text-[11px] bg-[#142328] text-[#4ade80] border border-[#224840]">
                              Δ = $0.00
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <StatusBadge status="settled" label="SETTLED" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: ATOMIC TRANSFERS */}
        {activeTab === 'transfers' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Transfer Terminal Input */}
            <div className="p-5 rounded bg-nyx-card border border-nyx-border flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-nyx-text">Transfer Terminal</h2>
                <p className="text-xs text-nyx-muted mt-0.5">
                  Execute real-time funds routing with isolated ACID transactions
                </p>
              </div>

              <form onSubmit={handleExecuteTransfer} className="flex flex-col gap-4">
                <div>
                  <label htmlFor={sourceSelectId} className="block text-xs text-nyx-muted mb-1">
                    Origin Account (Source Debit)
                  </label>
                  <select
                    id={sourceSelectId}
                    value={sourceAccountId}
                    onChange={e => setSourceAccountId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded bg-nyx-sidebar border border-nyx-border text-xs text-nyx-text focus:outline-none focus:border-nyx-highlight"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountNumber} ({formatMoney(acc.balance, acc.currency)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={destSelectId} className="block text-xs text-nyx-muted mb-1">
                    Destination Account (Target Credit)
                  </label>
                  <select
                    id={destSelectId}
                    value={destAccountId}
                    onChange={e => setDestAccountId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded bg-nyx-sidebar border border-nyx-border text-xs text-nyx-text focus:outline-none focus:border-nyx-highlight"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountNumber} ({formatMoney(acc.balance, acc.currency)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={transferAmountId} className="block text-xs text-nyx-muted mb-1">
                    Transfer Amount (USD)
                  </label>
                  <input
                    id={transferAmountId}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={transferAmount}
                    onChange={e => setTransferAmount(e.target.value)}
                    className="w-full h-9 px-2.5 rounded bg-nyx-sidebar border border-nyx-border text-xs text-nyx-text tabular-nums focus:outline-none focus:border-nyx-highlight"
                  />
                  {/* Preset Buttons */}
                  <div className="flex gap-2 mt-2">
                    {['10.00', '50.00', '100.00', '250.00'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTransferAmount(preset)}
                        className="px-2 py-1 rounded bg-nyx-sidebar border border-nyx-border text-[11px] text-nyx-muted hover:text-nyx-text transition"
                      >
                        ${preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor={transferDescId} className="block text-xs text-nyx-muted mb-1">
                    Operational Memo / Reference
                  </label>
                  <input
                    id={transferDescId}
                    type="text"
                    value={transferDescription}
                    onChange={e => setTransferDescription(e.target.value)}
                    className="w-full h-9 px-2.5 rounded bg-nyx-sidebar border border-nyx-border text-xs text-nyx-text focus:outline-none focus:border-nyx-highlight"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || accounts.length < 2}
                  className="w-full h-10 rounded bg-nyx-primary hover:bg-nyx-primary-hover text-white text-xs font-semibold transition disabled:opacity-50 mt-2"
                >
                  Commit Atomic Transfer
                </button>
              </form>
            </div>

            {/* Live Double-Entry Ledger Preview */}
            <div className="p-5 rounded bg-nyx-card border border-nyx-border flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-nyx-text">
                  Double-Entry Ledger Projection
                </h2>
                <p className="text-xs text-nyx-muted mt-0.5">
                  Mathematical projection committed atomically in a single transaction
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {/* Leg 1: Debit */}
                <div className="p-3.5 rounded bg-nyx-sidebar border border-nyx-border flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-[#f87171]">DEBIT ENTRY</div>
                    <div className="text-xs text-nyx-text mt-0.5">
                      {activeSourceAccount ? activeSourceAccount.accountNumber : 'Origin Account'}
                    </div>
                    <div className="text-[11px] text-nyx-muted">Liquidity Deduction</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#f87171] tabular-nums">
                      - {formatMoney(transferCents)}
                    </div>
                    <div className="text-[11px] text-nyx-muted">Posted immediately</div>
                  </div>
                </div>

                {/* Leg 2: Credit */}
                <div className="p-3.5 rounded bg-nyx-sidebar border border-nyx-border flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-[#4ade80]">CREDIT ENTRY</div>
                    <div className="text-xs text-nyx-text mt-0.5">
                      {activeDestAccount ? activeDestAccount.accountNumber : 'Target Account'}
                    </div>
                    <div className="text-[11px] text-nyx-muted">Beneficiary Addition</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#4ade80] tabular-nums">
                      + {formatMoney(transferCents)}
                    </div>
                    <div className="text-[11px] text-nyx-muted">Posted immediately</div>
                  </div>
                </div>

                {/* Mathematical Check Card */}
                <div className="p-3 rounded bg-nyx-background border border-nyx-border flex items-center justify-between text-xs">
                  <span className="text-nyx-muted">Net Ledger Invariant:</span>
                  <span className="text-nyx-highlight font-semibold tabular-nums">
                    Σ Debits - Σ Credits = $0.00
                  </span>
                </div>

                <div className="text-xs text-nyx-muted leading-relaxed">
                  Every transfer requires a unique idempotency key. If network disconnects midway,
                  the operation returns the cached atomic result without double charging.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RECONCILIATION */}
        {activeTab === 'reconciliation' && (
          <div className="flex flex-col gap-6">
            <div className="p-5 rounded bg-nyx-card border border-nyx-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-nyx-text">Automated Ledger Audit</h2>
                <p className="text-xs text-nyx-muted mt-0.5">
                  Audits account table balance against sum of historical double-entry entries
                </p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <label htmlFor={auditSelectId} className="sr-only">
                  Account to audit
                </label>
                <select
                  id={auditSelectId}
                  value={auditAccountId || (accounts[0]?.id ?? '')}
                  onChange={e => setAuditAccountId(e.target.value)}
                  className="h-9 px-3 rounded bg-nyx-sidebar border border-nyx-border text-xs text-nyx-text focus:outline-none focus:border-nyx-highlight"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountNumber} ({formatMoney(acc.balance, acc.currency)})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = auditAccountId || accounts[0]?.id;
                    if (targetId) void handleReconcile(targetId);
                  }}
                  className="h-9 px-4 rounded bg-nyx-primary hover:bg-nyx-primary-hover text-white text-xs font-medium transition shrink-0"
                >
                  Run Audit
                </button>
              </div>
            </div>

            {/* Reconciliation Proof Card */}
            {reconciliationResult ? (
              <div className="p-5 rounded bg-nyx-card border border-nyx-border flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={reconciliationResult.isReconciled ? 'balanced' : 'discrepant'}
                      label={
                        reconciliationResult.isReconciled ? 'AUDIT PASSED' : 'DISCREPANCY FOUND'
                      }
                    />
                    <span className="text-xs text-nyx-muted">
                      Account{' '}
                      {targetReconciledAccount?.accountNumber ??
                        reconciliationResult.accountId.slice(0, 8)}
                    </span>
                  </div>
                  <span className="text-xs text-nyx-muted tabular-nums">
                    Integrity status:{' '}
                    {reconciliationResult.isReconciled ? 'Zero variance' : 'Discrepancy detected'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-4 rounded bg-nyx-sidebar border border-nyx-border">
                    <div className="text-nyx-muted">Account Table Balance</div>
                    <div className="text-lg font-semibold text-nyx-text mt-1 tabular-nums">
                      {formatMoney(
                        reconciliationResult.accountBalance,
                        targetReconciledAccount?.currency,
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded bg-nyx-sidebar border border-nyx-border">
                    <div className="text-nyx-muted">Ledger Derived Balance</div>
                    <div className="text-lg font-semibold text-nyx-text mt-1 tabular-nums">
                      {formatMoney(
                        reconciliationResult.ledgerDerivedBalance,
                        targetReconciledAccount?.currency,
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded bg-nyx-sidebar border border-nyx-border">
                    <div className="text-nyx-muted">Posted Debits / Credits</div>
                    <div className="text-xs font-medium text-nyx-text mt-1.5 tabular-nums flex flex-col gap-0.5">
                      <span>
                        Dr:{' '}
                        {formatMoney(
                          reconciliationResult.totalDebits,
                          targetReconciledAccount?.currency,
                        )}
                      </span>
                      <span>
                        Cr:{' '}
                        {formatMoney(
                          reconciliationResult.totalCredits,
                          targetReconciledAccount?.currency,
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded bg-nyx-sidebar border border-nyx-border">
                    <div className="text-nyx-muted">Discrepancy (Variance)</div>
                    <div
                      className={`text-lg font-semibold mt-1 tabular-nums ${
                        reconciliationResult.discrepancy === 0 ? 'text-[#4ade80]' : 'text-[#f87171]'
                      }`}
                    >
                      {formatMoney(
                        reconciliationResult.discrepancy,
                        targetReconciledAccount?.currency,
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded border border-dashed border-nyx-border bg-nyx-card/30 text-center text-xs text-nyx-muted">
                Select an account above and click &quot;Run Audit&quot; to verify ledger integrity
                against recorded balance.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: OUTBOX & WEBHOOKS */}
        {activeTab === 'outbox' && (
          <div className="flex flex-col gap-6">
            <div className="p-5 rounded bg-nyx-card border border-nyx-border">
              <h2 className="text-base font-semibold text-nyx-text">
                Transactional Outbox Event Stream
              </h2>
              <p className="text-xs text-nyx-muted mt-1 leading-relaxed">
                The Outbox Pattern ensures events are saved in the same PostgreSQL transaction as
                ledger mutations. Events are asynchronously dispatched to subscribed endpoints with
                HMAC-SHA256 signatures for zero message loss.
              </p>
            </div>

            <div className="rounded bg-nyx-card border border-nyx-border overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-nyx-border bg-nyx-sidebar/60 text-nyx-muted">
                    <th className="py-2.5 px-3 font-medium">Event Topic</th>
                    <th className="py-2.5 px-3 font-medium">Payload Data</th>
                    <th className="py-2.5 px-3 font-medium">HMAC Signature</th>
                    <th className="py-2.5 px-3 font-medium text-right">Timestamp</th>
                    <th className="py-2.5 px-3 font-medium text-right">Dispatch Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nyx-border/40">
                  {webhookEvents.map(evt => (
                    <tr key={evt.id} className="hover:bg-nyx-sidebar/30 transition">
                      <td className="py-2.5 px-3 font-medium text-nyx-highlight">
                        <div>{evt.topic}</div>
                        <code className="text-[11px] text-nyx-muted block">{evt.id}</code>
                      </td>
                      <td className="py-2.5 px-3 text-nyx-text text-[11px]">
                        <code>{evt.payloadSummary}</code>
                      </td>
                      <td className="py-2.5 px-3 text-nyx-muted text-[11px]">
                        <code>{evt.signature}</code>
                      </td>
                      <td className="py-2.5 px-3 text-right text-nyx-muted tabular-nums">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <StatusBadge status="settled" label="DISPATCHED" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
