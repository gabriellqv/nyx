/**
 * Base domain exception representing invariant violations.
 */
export abstract class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class InsufficientFundsException extends DomainException {
  constructor(message = 'Account has insufficient funds for this operation') {
    super(message);
  }
}

export class CurrencyMismatchException extends DomainException {
  constructor(message = 'Currency mismatch between accounts or operations') {
    super(message);
  }
}

export class AccountInactiveException extends DomainException {
  constructor(message = 'Account is not in active status') {
    super(message);
  }
}

export class InvalidAmountException extends DomainException {
  constructor(message = 'Invalid monetary amount specified') {
    super(message);
  }
}

export class UnbalancedLedgerException extends DomainException {
  constructor(message = 'Double-entry ledger posting debits and credits do not balance') {
    super(message);
  }
}

export class IdempotencyConflictException extends DomainException {
  constructor(message = 'Operation payload conflicts with previously executed idempotency key') {
    super(message);
  }
}

export class EntityNotFoundException extends DomainException {
  constructor(entityName: string, identifier: string) {
    super(`${entityName} with identifier "${identifier}" was not found`);
  }
}
