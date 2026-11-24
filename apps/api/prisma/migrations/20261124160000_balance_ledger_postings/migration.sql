CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "account_type" TEXT NOT NULL DEFAULT 'asset',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_accounts_code_currency_key"
ON "ledger_accounts"("code", "currency");

ALTER TABLE "ledger_accounts"
ADD CONSTRAINT "ledger_accounts_type_check"
CHECK ("account_type" IN ('asset', 'liability', 'equity', 'revenue', 'expense'));

ALTER TABLE "ledger_entries" ALTER COLUMN "account_id" DROP NOT NULL;
ALTER TABLE "ledger_entries" ADD COLUMN "ledger_account_id" TEXT;

ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_account_target_check"
CHECK (num_nonnulls("account_id", "ledger_account_id") = 1);

ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_entry_type_check"
CHECK ("entry_type" IN ('debit', 'credit'));

ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_amount_positive_check"
CHECK ("amount" > 0);

CREATE UNIQUE INDEX "ledger_entries_transaction_id_sequence_number_key"
ON "ledger_entries"("transaction_id", "sequence_number");

CREATE INDEX "ledger_entries_ledger_account_id_idx"
ON "ledger_entries"("ledger_account_id");

ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_ledger_account_id_fkey"
FOREIGN KEY ("ledger_account_id") REFERENCES "ledger_accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
DROP CONSTRAINT "ledger_entries_transaction_id_fkey";

ALTER TABLE "ledger_entries"
ADD CONSTRAINT "ledger_entries_transaction_id_fkey"
FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ledger_accounts" ("id", "code", "name", "currency", "account_type")
SELECT gen_random_uuid()::text, 'payment-clearing', 'Incoming payment clearing', p."currency", 'asset'
FROM "payments" p
JOIN "ledger_transactions" t
  ON t."reference_type" = 'payment' AND t."reference_id" = p."id"
GROUP BY p."currency"
ON CONFLICT ("code", "currency") DO NOTHING;

INSERT INTO "ledger_entries" (
    "id", "transaction_id", "ledger_account_id", "entry_type", "amount", "currency", "sequence_number", "created_at"
)
SELECT
    gen_random_uuid()::text,
    t."id",
    la."id",
    'debit',
    p."amount",
    p."currency",
    COALESCE((SELECT MAX(e."sequence_number") + 1 FROM "ledger_entries" e WHERE e."transaction_id" = t."id"), 1),
    t."created_at"
FROM "payments" p
JOIN "ledger_transactions" t
  ON t."reference_type" = 'payment' AND t."reference_id" = p."id"
JOIN "ledger_accounts" la
  ON la."code" = 'payment-clearing' AND la."currency" = p."currency"
WHERE NOT EXISTS (
    SELECT 1 FROM "ledger_entries" e
    WHERE e."transaction_id" = t."id" AND e."entry_type" = 'debit'
);

CREATE FUNCTION enforce_balanced_ledger_transaction()
RETURNS TRIGGER AS $$
DECLARE
    target_transaction_id TEXT;
    posting_count BIGINT;
    unbalanced_currency_count BIGINT;
    currency_mismatch_count BIGINT;
BEGIN
    IF TG_TABLE_NAME = 'ledger_transactions' THEN
        target_transaction_id := COALESCE(NEW."id", OLD."id");
    ELSE
        target_transaction_id := COALESCE(NEW."transaction_id", OLD."transaction_id");
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "ledger_transactions" WHERE "id" = target_transaction_id
    ) THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*) INTO posting_count
    FROM "ledger_entries"
    WHERE "transaction_id" = target_transaction_id;

    SELECT COUNT(*) INTO unbalanced_currency_count
    FROM (
        SELECT "currency"
        FROM "ledger_entries"
        WHERE "transaction_id" = target_transaction_id
        GROUP BY "currency"
        HAVING COALESCE(SUM("amount") FILTER (WHERE "entry_type" = 'debit'), 0)
            <> COALESCE(SUM("amount") FILTER (WHERE "entry_type" = 'credit'), 0)
    ) AS unbalanced;

    SELECT COUNT(*) INTO currency_mismatch_count
    FROM "ledger_entries" e
    LEFT JOIN "accounts" a ON a."id" = e."account_id"
    LEFT JOIN "ledger_accounts" la ON la."id" = e."ledger_account_id"
    WHERE e."transaction_id" = target_transaction_id
      AND e."currency" <> COALESCE(a."currency", la."currency");

    IF posting_count < 2 OR unbalanced_currency_count > 0 OR currency_mismatch_count > 0 THEN
        RAISE EXCEPTION 'ledger transaction % must contain at least two balanced postings per currency with matching account currencies', target_transaction_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "ledger_entries_balanced_constraint"
AFTER INSERT OR UPDATE OR DELETE ON "ledger_entries"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_balanced_ledger_transaction();

CREATE CONSTRAINT TRIGGER "ledger_transactions_balanced_constraint"
AFTER INSERT ON "ledger_transactions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_balanced_ledger_transaction();

CREATE FUNCTION reject_posted_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'posted ledger records are immutable'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_immutable"
BEFORE UPDATE OR DELETE ON "ledger_entries"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();

CREATE TRIGGER "ledger_transactions_immutable"
BEFORE UPDATE OR DELETE ON "ledger_transactions"
FOR EACH ROW EXECUTE FUNCTION reject_posted_ledger_mutation();
