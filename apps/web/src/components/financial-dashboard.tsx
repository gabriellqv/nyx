'use client';

import React, { useState, useEffect, useId } from 'react';
import type {
  AccountResponse,
  CustomerResponse,
  TransferResponse,
  LedgerReconciliationResponse,
  AuthResponse,
  UserProfile,
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
} from './icons';
import { NyxLogo } from './nyx-logo';
import { LanguageSwitch } from './language-switch';
import { StatusBadge } from './status-badge';
import { useI18n } from '../lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const MAX_MINOR_UNITS = 9223372036854775807n;

function parseMajorAmountToMinorUnits(value: string, currency: string): string | null {
  const fractionDigits =
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const decimalPattern = fractionDigits > 0 ? `(?:\\.\\d{0,${fractionDigits}})?` : '';
  if (!new RegExp(`^\\d+${decimalPattern}$`).test(value)) {
    return null;
  }

  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(`${whole}${fraction.padEnd(fractionDigits, '0')}`);
  if (amount <= 0n || amount > MAX_MINOR_UNITS) {
    return null;
  }
  return amount.toString();
}

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
  const { t, formatMoney } = useI18n();

  const [activeTab, setActiveTab] = useState<TabView>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);

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
  const [webhookEvents] = useState<WebhookSimEvent[]>([
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

  const apiFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    return fetch(url, { ...init, headers });
  };

  const fetchData = async (): Promise<void> => {
    try {
      const [accRes, custRes, transRes] = await Promise.all([
        apiFetch(`${API_URL}/accounts?limit=100`).then(r => (r.ok ? r.json() : { items: [] })),
        apiFetch(`${API_URL}/customers`).then(r => (r.ok ? r.json() : [])),
        apiFetch(`${API_URL}/transfers?limit=100`).then(r => (r.ok ? r.json() : { items: [] })),
      ]);

      setAccounts(accRes.items);
      setCustomers(custRes);
      setTransfers(transRes.items);

      if (accRes.items.length >= 2) {
        if (!sourceAccountId) setSourceAccountId(accRes.items[0].id);
        if (!destAccountId) setDestAccountId(accRes.items[1].id);
      }
      if (accRes.items.length >= 1 && !depositAccountId) {
        setDepositAccountId(accRes.items[0].id);
      }
      if (accRes.items.length >= 1 && !auditAccountId) {
        setAuditAccountId(accRes.items[0].id);
      }
    } catch {
      // Graceful offline fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      void fetchData();
    }
  }, [accessToken]);

  const handleLogin = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setAuthenticating(true);
    setLoginError(null);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (!response.ok) {
        throw new Error(t.auth.invalidCredentials);
      }

      const auth: AuthResponse = await response.json();
      setAccessToken(auth.accessToken);
      setCurrentUser(auth.user);
      setLoginPassword('');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : t.auth.invalidCredentials);
    } finally {
      setAuthenticating(false);
    }
  };

  if (!accessToken) {
    return (
      <main className="min-h-dvh bg-nyx-background text-nyx-text flex items-center justify-center p-4">
        <section className="w-full max-w-sm rounded bg-nyx-card border border-nyx-border p-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <NyxLogo height={24} />
              <h1 className="text-lg font-semibold mt-5">{t.auth.title}</h1>
              <p className="text-xs text-nyx-muted mt-1">{t.auth.subtitle}</p>
            </div>
            <LanguageSwitch />
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label htmlFor="login-email" className="block text-xs text-nyx-muted mb-1">
                {t.auth.email}
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="username"
                value={loginEmail}
                onChange={event => setLoginEmail(event.target.value)}
                className="w-full h-10 px-3 rounded bg-nyx-sidebar border border-nyx-border text-sm focus:outline-none focus:border-nyx-highlight"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs text-nyx-muted mb-1">
                {t.auth.password}
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={loginPassword}
                onChange={event => setLoginPassword(event.target.value)}
                className="w-full h-10 px-3 rounded bg-nyx-sidebar border border-nyx-border text-sm focus:outline-none focus:border-nyx-highlight"
              />
            </div>

            {loginError && <p className="text-xs text-[#f87171]">{loginError}</p>}

            <button
              type="submit"
              disabled={authenticating}
              className="h-10 rounded bg-nyx-primary hover:bg-nyx-primary-hover text-white text-sm font-medium disabled:opacity-50"
            >
              {authenticating ? t.auth.signingIn : t.auth.signIn}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const totalCustodyBalance = accounts
    .reduce((acc, curr) => acc + BigInt(curr.balance), 0n)
    .toString();
  const isAdmin = currentUser?.role === 'admin';

  const handleSeedInitialData = async (): Promise<void> => {
    setSubmitting(true);
    setActionNotice(null);
    try {
      // 1. Create Corporate Customer
      const custRes = await apiFetch(`${API_URL}/customers`, {
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
      const acc1Res = await apiFetch(`${API_URL}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          currency: 'USD',
          type: 'checking',
          initialDeposit: '100000',
        }),
      });
      if (!acc1Res.ok) throw new Error('Primary account provisioning rejected');
      const acc1: AccountResponse = await acc1Res.json();

      // 3. Create Liquidity Clearing Account ($500.00 USD)
      const acc2Res = await apiFetch(`${API_URL}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer.id,
          currency: 'USD',
          type: 'savings',
          initialDeposit: '50000',
        }),
      });
      if (!acc2Res.ok) throw new Error('Clearing account provisioning rejected');
      const acc2: AccountResponse = await acc2Res.json();

      // 4. Execute Demonstration Atomic Transfer ($150.00 USD)
      await apiFetch(`${API_URL}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAccountId: acc1.id,
          destinationAccountId: acc2.id,
          amount: '15000',
          currency: 'USD',
          description: 'Automated treasury rebalance',
          idempotencyKey: `seed-transfer-${Date.now()}`,
        }),
      });

      await fetchData();
      setSourceAccountId(acc1.id);
      setDestAccountId(acc2.id);
      setActionNotice({
        type: 'ok',
        message: t.notices.seedSuccess,
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: t.notices.seedFailed((err as Error).message),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!sourceAccountId || !destAccountId) return;
    if (sourceAccountId === destAccountId) {
      setActionNotice({
        type: 'error',
        message: t.transfers.sameAccountError,
      });
      return;
    }

    const currency = accounts.find(account => account.id === sourceAccountId)?.currency ?? 'USD';
    const amountMinor = parseMajorAmountToMinorUnits(transferAmount, currency);
    if (!amountMinor) return;

    setSubmitting(true);
    setActionNotice(null);

    const idempotencyKey = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const res = await apiFetch(`${API_URL}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAccountId,
          destinationAccountId: destAccountId,
          amount: amountMinor,
          currency,
          description: transferDescription,
          idempotencyKey,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message ?? 'Transfer rejected by core');
      }

      await fetchData();
      const srcAcc = accounts.find(a => a.id === sourceAccountId);
      const dstAcc = accounts.find(a => a.id === destAccountId);
      setActionNotice({
        type: 'ok',
        message: t.notices.transferSuccess(
          srcAcc?.accountNumber ?? sourceAccountId.slice(0, 8),
          dstAcc?.accountNumber ?? destAccountId.slice(0, 8),
          formatMoney(amountMinor, currency),
        ),
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: t.notices.transferFailed((err as Error).message),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDepositFunds = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!depositAccountId) return;

    const currency = accounts.find(account => account.id === depositAccountId)?.currency ?? 'USD';
    const amountMinor = parseMajorAmountToMinorUnits(depositAmount, currency);
    if (!amountMinor) return;

    setSubmitting(true);
    setActionNotice(null);

    const idempotencyKey = `dep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const res = await apiFetch(`${API_URL}/accounts/${depositAccountId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountMinor,
          idempotencyKey,
          description: 'Institutional treasury deposit',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message ?? 'Deposit rejected');
      }

      await fetchData();
      const targetAcc = accounts.find(a => a.id === depositAccountId);
      setActionNotice({
        type: 'ok',
        message: t.notices.depositSuccess(
          targetAcc?.accountNumber ?? depositAccountId.slice(0, 8),
          formatMoney(amountMinor, currency),
        ),
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: t.notices.depositFailed((err as Error).message),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconcile = async (accountId: string): Promise<void> => {
    try {
      const res = await apiFetch(`${API_URL}/accounts/${accountId}/reconcile`);
      if (res.ok) {
        const data: LedgerReconciliationResponse = await res.json();
        setReconciliationResult(data);
        const targetAcc = accounts.find(a => a.id === accountId);
        const accNumber = targetAcc ? targetAcc.accountNumber : accountId.slice(0, 8);
        setActionNotice({
          type: data.isReconciled ? 'ok' : 'error',
          message: data.isReconciled
            ? t.notices.reconciliationSuccess(accNumber)
            : t.notices.reconciliationDiscrepancy(accNumber),
        });
      }
    } catch (err) {
      setActionNotice({
        type: 'error',
        message: t.notices.reconciliationError((err as Error).message),
      });
    }
  };

  const activeSourceAccount = accounts.find(a => a.id === sourceAccountId);
  const activeDestAccount = accounts.find(a => a.id === destAccountId);
  const targetReconciledAccount = reconciliationResult
    ? accounts.find(a => a.id === reconciliationResult.accountId)
    : null;
  const transferCurrency = activeSourceAccount?.currency ?? 'USD';
  const transferMinorUnits = parseMajorAmountToMinorUnits(transferAmount, transferCurrency) ?? '0';

  return (
    <div className="min-h-dvh bg-nyx-background text-nyx-text flex flex-col lg:flex-row">
      {/* Mobile Top Header */}
      <div className="lg:hidden bg-nyx-sidebar border-b border-nyx-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <NyxLogo height={20} />
          <span className="text-xs text-nyx-muted border-l border-nyx-border pl-2.5 font-medium">
            {t.brand.tagline}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded bg-nyx-card text-nyx-text border border-nyx-border"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
          </button>
        </div>
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
            <div className="text-xs text-nyx-muted font-medium">{t.brand.coreBanking}</div>
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
              <span>{t.nav.overview}</span>
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
              <span>{t.nav.transfers}</span>
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
              <span>{t.nav.reconciliation}</span>
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
              <span>{t.nav.outbox}</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* Main Workspace Canvas */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Top Control and Global Status Bar */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-nyx-border">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-nyx-text">
              {activeTab === 'overview' && t.header.overviewTitle}
              {activeTab === 'transfers' && t.header.transfersTitle}
              {activeTab === 'reconciliation' && t.header.reconciliationTitle}
              {activeTab === 'outbox' && t.header.outboxTitle}
            </h1>
            <p className="text-xs text-nyx-muted mt-0.5">{t.header.subtitle}</p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
            <LanguageSwitch className="hidden sm:inline-flex" />
            <StatusBadge status="ok" label={t.header.coreOperational} />
            <button
              type="button"
              onClick={() => {
                setAccessToken(null);
                setCurrentUser(null);
              }}
              className="px-3 py-1.5 rounded text-xs border border-nyx-border text-nyx-muted hover:text-nyx-text"
            >
              {t.auth.signOut}
            </button>
            <button
              type="button"
              onClick={() => void fetchData()}
              disabled={loading}
              className="p-1.5 rounded bg-nyx-card border border-nyx-border text-nyx-muted hover:text-nyx-text transition"
              title={t.header.refreshTitle}
            >
              <RefreshIcon size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => void handleSeedInitialData()}
                disabled={submitting}
                className="px-3 py-1.5 rounded text-xs font-medium bg-nyx-primary hover:bg-nyx-primary-hover text-white transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <PlusIcon size={14} />
                <span>{submitting ? t.header.seeding : t.header.seedDemo}</span>
              </button>
            )}
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
            <div className="text-[13px] text-nyx-muted">{t.metrics.totalLiquidity}</div>
            <div className="text-xl sm:text-2xl font-semibold text-nyx-text mt-1 tabular-nums">
              {formatMoney(totalCustodyBalance)}
            </div>
            <div className="text-xs text-[#4ade80] mt-1">{t.metrics.auditedInCents}</div>
          </div>

          <div className="p-4 rounded bg-nyx-card border border-nyx-border">
            <div className="text-[13px] text-nyx-muted">{t.metrics.activeAccounts}</div>
            <div className="text-xl sm:text-2xl font-semibold text-nyx-text mt-1 tabular-nums">
              {accounts.length}
            </div>
            <div className="text-xs text-nyx-muted mt-1">{t.metrics.operatingSettlement}</div>
          </div>

          <div className="p-4 rounded bg-nyx-card border border-nyx-border">
            <div className="text-[13px] text-nyx-muted">{t.metrics.settledTransfers}</div>
            <div className="text-xl sm:text-2xl font-semibold text-nyx-text mt-1 tabular-nums">
              {transfers.length}
            </div>
            <div className="text-xs text-[#4ade80] mt-1">{t.metrics.zeroVariance}</div>
          </div>

          <div className="p-4 rounded bg-nyx-card border border-nyx-border">
            <div className="text-[13px] text-nyx-muted">{t.metrics.ledgerEquilibrium}</div>
            <div className="text-xl sm:text-2xl font-semibold text-nyx-highlight mt-1 tabular-nums">
              {t.metrics.equilibriumValue}
            </div>
            <div className="text-xs text-nyx-muted mt-1">{t.metrics.mathematicalGuarantee}</div>
          </div>
        </section>

        {/* TAB 1: LEDGER & ACCOUNTS */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-6">
            {/* Accounts Registry Grid */}
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-nyx-text">{t.accounts.registryTitle}</h2>
                <span className="text-xs text-nyx-muted tabular-nums">
                  {t.accounts.registryCount(accounts.length)}
                </span>
              </div>

              {accounts.length === 0 ? (
                <div className="p-8 rounded border border-dashed border-nyx-border bg-nyx-card/30 text-center flex flex-col items-center justify-center gap-3">
                  <div className="text-sm text-nyx-muted max-w-sm">{t.accounts.emptyText}</div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void handleSeedInitialData()}
                      disabled={submitting}
                      className="px-3.5 py-1.5 rounded text-xs font-medium bg-nyx-primary hover:bg-nyx-primary-hover text-white transition"
                    >
                      {t.accounts.seedButton}
                    </button>
                  )}
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
                          <div className="text-[13px] text-nyx-muted">
                            {t.accounts.accountNumber}
                          </div>
                          <div className="text-sm font-semibold text-nyx-text mt-0.5">
                            {account.accountNumber}
                          </div>
                        </div>
                        <StatusBadge
                          status={account.status === 'active' ? 'settled' : 'pending'}
                          label={account.status === 'active' ? t.status.active : t.status.pending}
                        />
                      </div>

                      <div className="pt-1">
                        <div className="text-[13px] text-nyx-muted">
                          {t.accounts.availableBalance}
                        </div>
                        <div className="text-2xl font-semibold text-nyx-text tabular-nums mt-0.5">
                          {formatMoney(account.balance, account.currency)}
                        </div>
                        <div className="text-xs text-nyx-muted mt-1">
                          {t.accounts.currencyType(account.currency, account.type)}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-nyx-border/60 flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => void handleReconcile(account.id)}
                          className="text-nyx-highlight hover:underline font-medium text-[13px]"
                        >
                          {t.accounts.auditLedger}
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

            {isAdmin && (
              <section className="p-5 rounded bg-nyx-card border border-nyx-border">
                <h2 className="text-sm font-semibold text-nyx-text mb-3">
                  {t.accounts.depositSectionTitle}
                </h2>
                <form
                  onSubmit={handleDepositFunds}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
                >
                  <div>
                    <label htmlFor={depositSelectId} className="block text-xs text-nyx-muted mb-1">
                      {t.accounts.targetAccountLabel}
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
                      {t.accounts.depositAmountLabel}
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
                    {submitting ? t.accounts.depositing : t.accounts.depositButton}
                  </button>
                </form>
              </section>
            )}

            {/* Recent Double-Entry Transfers Stream */}
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-nyx-text">{t.transfers.recentTitle}</h2>
              <div className="rounded bg-nyx-card border border-nyx-border overflow-x-auto">
                {transfers.length === 0 ? (
                  <div className="p-6 text-center text-xs text-nyx-muted">
                    {t.transfers.emptyText}
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-nyx-border bg-nyx-sidebar/60 text-nyx-muted">
                        <th className="py-2.5 px-3 font-medium">{t.transfers.thTransaction}</th>
                        <th className="py-2.5 px-3 font-medium">{t.transfers.thDebit}</th>
                        <th className="py-2.5 px-3 font-medium">{t.transfers.thCredit}</th>
                        <th className="py-2.5 px-3 font-medium text-right">
                          {t.transfers.thAmount}
                        </th>
                        <th className="py-2.5 px-3 font-medium text-center">{t.transfers.thFee}</th>
                        <th className="py-2.5 px-3 font-medium text-right">
                          {t.transfers.thStatus}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nyx-border/40">
                      {transfers.map(tr => (
                        <tr key={tr.id} className="hover:bg-nyx-sidebar/30 transition">
                          <td className="py-2.5 px-3 font-medium text-nyx-text">
                            <div>{tr.description || 'Atomic Transfer'}</div>
                            <code className="text-[11px] text-nyx-muted block">
                              {tr.id.slice(0, 16)}...
                            </code>
                          </td>
                          <td className="py-2.5 px-3 text-nyx-muted">
                            <span className="text-[#f87171] mr-1">-</span>
                            <span>{tr.sourceAccountId.slice(0, 12)}...</span>
                          </td>
                          <td className="py-2.5 px-3 text-nyx-muted">
                            <span className="text-[#4ade80] mr-1">+</span>
                            <span>{tr.destinationAccountId.slice(0, 12)}...</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-nyx-text tabular-nums">
                            {formatMoney(tr.amount, tr.currency)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-1.5 py-0.5 rounded text-[11px] bg-[#142328] text-[#4ade80] border border-[#224840]">
                              {t.transfers.feeFree}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <StatusBadge status="settled" label={t.status.settled} />
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
                <h2 className="text-base font-semibold text-nyx-text">
                  {t.transfers.terminalTitle}
                </h2>
                <p className="text-xs text-nyx-muted mt-0.5">{t.transfers.terminalSubtitle}</p>
              </div>

              <form onSubmit={handleExecuteTransfer} className="flex flex-col gap-4">
                <div>
                  <label htmlFor={sourceSelectId} className="block text-xs text-nyx-muted mb-1">
                    {t.transfers.originLabel}
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
                    {t.transfers.destinationLabel}
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
                    {t.transfers.amountLabel}
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
                    {t.transfers.descriptionLabel}
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
                  {submitting ? t.transfers.executing : t.transfers.executeButton}
                </button>
              </form>
            </div>

            {/* Live Double-Entry Ledger Preview */}
            <div className="p-5 rounded bg-nyx-card border border-nyx-border flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-nyx-text">
                  {t.transfers.previewTitle}
                </h2>
                <p className="text-xs text-nyx-muted mt-0.5">{t.transfers.terminalSubtitle}</p>
              </div>

              <div className="flex flex-col gap-3">
                {/* Leg 1: Debit */}
                <div className="p-3.5 rounded bg-nyx-sidebar border border-nyx-border flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-[#f87171]">
                      {t.transfers.debitTitle}
                    </div>
                    <div className="text-xs text-nyx-text mt-0.5">
                      {activeSourceAccount
                        ? activeSourceAccount.accountNumber
                        : t.transfers.originLabel}
                    </div>
                    <div className="text-[11px] text-nyx-muted">{t.transfers.debitLeg}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#f87171] tabular-nums">
                      - {formatMoney(transferMinorUnits, transferCurrency)}
                    </div>
                    <div className="text-[11px] text-nyx-muted">
                      {t.transfers.postedImmediately}
                    </div>
                  </div>
                </div>

                {/* Leg 2: Credit */}
                <div className="p-3.5 rounded bg-nyx-sidebar border border-nyx-border flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-[#4ade80]">
                      {t.transfers.creditTitle}
                    </div>
                    <div className="text-xs text-nyx-text mt-0.5">
                      {activeDestAccount
                        ? activeDestAccount.accountNumber
                        : t.transfers.destinationLabel}
                    </div>
                    <div className="text-[11px] text-nyx-muted">{t.transfers.creditLeg}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-[#4ade80] tabular-nums">
                      + {formatMoney(transferMinorUnits, transferCurrency)}
                    </div>
                    <div className="text-[11px] text-nyx-muted">
                      {t.transfers.postedImmediately}
                    </div>
                  </div>
                </div>

                {/* Transfer Fee Slip */}
                <div className="p-3 rounded bg-nyx-background border border-nyx-border flex items-center justify-between text-xs">
                  <span className="text-nyx-muted">{t.transfers.feeLabel}</span>
                  <span className="text-[#4ade80] font-semibold tabular-nums">
                    {t.transfers.feeFree}
                  </span>
                </div>

                <div className="text-xs text-nyx-muted leading-relaxed">
                  {t.transfers.atomicInvariantNotice}
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
                <h2 className="text-base font-semibold text-nyx-text">{t.reconciliation.title}</h2>
                <p className="text-xs text-nyx-muted mt-0.5">{t.reconciliation.subtitle}</p>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <label htmlFor={auditSelectId} className="sr-only">
                  {t.reconciliation.selectLabel}
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
                  {t.reconciliation.runAuditButton}
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
                        reconciliationResult.isReconciled
                          ? t.reconciliation.auditPassed
                          : t.reconciliation.discrepancyFound
                      }
                    />
                    <span className="text-xs text-nyx-muted">
                      {t.reconciliation.accountPrefix}{' '}
                      {targetReconciledAccount?.accountNumber ??
                        reconciliationResult.accountId.slice(0, 8)}
                    </span>
                  </div>
                  <span className="text-xs text-nyx-muted tabular-nums">
                    {reconciliationResult.isReconciled
                      ? t.reconciliation.zeroVarianceStatus
                      : t.reconciliation.discrepancyStatus}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="p-4 rounded bg-nyx-sidebar border border-nyx-border">
                    <div className="text-nyx-muted">{t.reconciliation.tableBalance}</div>
                    <div className="text-lg font-semibold text-nyx-text mt-1 tabular-nums">
                      {formatMoney(
                        reconciliationResult.accountBalance,
                        targetReconciledAccount?.currency,
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded bg-nyx-sidebar border border-nyx-border">
                    <div className="text-nyx-muted">{t.reconciliation.derivedBalance}</div>
                    <div className="text-lg font-semibold text-nyx-text mt-1 tabular-nums">
                      {formatMoney(
                        reconciliationResult.ledgerDerivedBalance,
                        targetReconciledAccount?.currency,
                      )}
                    </div>
                  </div>

                  <div className="p-4 rounded bg-nyx-sidebar border border-nyx-border">
                    <div className="text-nyx-muted">{t.reconciliation.postedLegs}</div>
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
                    <div className="text-nyx-muted">{t.reconciliation.discrepancy}</div>
                    <div
                      className={`text-lg font-semibold mt-1 tabular-nums ${
                        reconciliationResult.discrepancy === '0'
                          ? 'text-[#4ade80]'
                          : 'text-[#f87171]'
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
                {t.reconciliation.emptyPrompt}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: OUTBOX & WEBHOOKS */}
        {activeTab === 'outbox' && (
          <div className="flex flex-col gap-6">
            <div className="p-5 rounded bg-nyx-card border border-nyx-border">
              <h2 className="text-base font-semibold text-nyx-text">{t.outbox.title}</h2>
              <p className="text-xs text-nyx-muted mt-1 leading-relaxed">{t.outbox.subtitle}</p>
            </div>

            <div className="rounded bg-nyx-card border border-nyx-border overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-nyx-border bg-nyx-sidebar/60 text-nyx-muted">
                    <th className="py-2.5 px-3 font-medium">{t.outbox.thTopic}</th>
                    <th className="py-2.5 px-3 font-medium">{t.outbox.thPayload}</th>
                    <th className="py-2.5 px-3 font-medium">{t.outbox.thSignature}</th>
                    <th className="py-2.5 px-3 font-medium text-right">{t.outbox.thTimestamp}</th>
                    <th className="py-2.5 px-3 font-medium text-right">{t.outbox.thStatus}</th>
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
                        <StatusBadge status="settled" label={t.outbox.statusDispatched} />
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
