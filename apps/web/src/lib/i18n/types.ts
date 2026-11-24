export type Locale = 'en' | 'pt-BR';

export interface TranslationDictionary {
  locale: Locale;
  brand: {
    name: string;
    tagline: string;
    coreBanking: string;
  };
  nav: {
    overview: string;
    transfers: string;
    reconciliation: string;
    outbox: string;
  };
  header: {
    overviewTitle: string;
    transfersTitle: string;
    reconciliationTitle: string;
    outboxTitle: string;
    subtitle: string;
    coreOperational: string;
    refreshTitle: string;
    seedDemo: string;
    seeding: string;
  };
  metrics: {
    totalLiquidity: string;
    auditedInCents: string;
    activeAccounts: string;
    operatingSettlement: string;
    settledTransfers: string;
    zeroVariance: string;
    ledgerEquilibrium: string;
    equilibriumValue: string;
    mathematicalGuarantee: string;
  };
  accounts: {
    registryTitle: string;
    registryCount: (count: number) => string;
    emptyText: string;
    seedButton: string;
    accountNumber: string;
    availableBalance: string;
    currencyType: (currency: string, type: string) => string;
    auditLedger: string;
    depositSectionTitle: string;
    targetAccountLabel: string;
    depositAmountLabel: string;
    depositButton: string;
    depositing: string;
  };
  transfers: {
    recentTitle: string;
    emptyText: string;
    thTransaction: string;
    thDebit: string;
    thCredit: string;
    thAmount: string;
    thDescription: string;
    thTime: string;
    thStatus: string;
    terminalTitle: string;
    terminalSubtitle: string;
    originLabel: string;
    destinationLabel: string;
    amountLabel: string;
    descriptionLabel: string;
    executeButton: string;
    executing: string;
    previewTitle: string;
    debitLeg: string;
    creditLeg: string;
    atomicInvariantNotice: string;
    insufficientFunds: string;
    sameAccountError: string;
  };
  reconciliation: {
    title: string;
    subtitle: string;
    selectLabel: string;
    runAuditButton: string;
    auditing: string;
    auditPassed: string;
    discrepancyFound: string;
    accountPrefix: string;
    zeroVarianceStatus: string;
    discrepancyStatus: string;
    tableBalance: string;
    derivedBalance: string;
    postedLegs: string;
    discrepancy: string;
    emptyPrompt: string;
  };
  outbox: {
    title: string;
    subtitle: string;
    thTopic: string;
    thPayload: string;
    thSignature: string;
    thTimestamp: string;
    thStatus: string;
    statusDispatched: string;
    statusPending: string;
  };
  notices: {
    depositSuccess: (acc: string, amt: string) => string;
    depositFailed: (err: string) => string;
    transferSuccess: (src: string, dst: string, amt: string) => string;
    transferFailed: (err: string) => string;
    reconciliationSuccess: (acc: string) => string;
    reconciliationDiscrepancy: (acc: string) => string;
    reconciliationError: (err: string) => string;
    seedSuccess: string;
    seedFailed: (err: string) => string;
  };
  notFound: {
    code: string;
    title: string;
    description: string;
    returnButton: string;
  };
  status: {
    active: string;
    inactive: string;
    settled: string;
    pending: string;
    processing: string;
    failed: string;
    balanced: string;
    discrepant: string;
  };
}
