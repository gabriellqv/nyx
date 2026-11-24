ALTER TABLE "transfers" ADD COLUMN "request_hash" TEXT;
ALTER TABLE "payments" ADD COLUMN "request_hash" TEXT;

CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "description" TEXT,
    "response_body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transfer_reversals" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_reversals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deposits_idempotency_key_key" ON "deposits"("idempotency_key");
CREATE INDEX "deposits_account_id_created_at_idx" ON "deposits"("account_id", "created_at");
CREATE UNIQUE INDEX "transfer_reversals_transfer_id_key" ON "transfer_reversals"("transfer_id");
CREATE UNIQUE INDEX "transfer_reversals_idempotency_key_key" ON "transfer_reversals"("idempotency_key");

ALTER TABLE "deposits"
ADD CONSTRAINT "deposits_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfer_reversals"
ADD CONSTRAINT "transfer_reversals_transfer_id_fkey"
FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
