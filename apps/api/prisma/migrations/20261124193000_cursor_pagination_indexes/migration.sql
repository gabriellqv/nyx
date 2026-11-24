DROP INDEX "accounts_customer_id_idx";
CREATE INDEX "accounts_customer_id_created_at_id_idx"
ON "accounts"("customer_id", "created_at", "id");
CREATE INDEX "accounts_created_at_id_idx"
ON "accounts"("created_at", "id");

DROP INDEX "transfers_source_account_id_idx";
DROP INDEX "transfers_destination_account_id_idx";
CREATE INDEX "transfers_source_account_id_created_at_id_idx"
ON "transfers"("source_account_id", "created_at", "id");
CREATE INDEX "transfers_destination_account_id_created_at_id_idx"
ON "transfers"("destination_account_id", "created_at", "id");
CREATE INDEX "transfers_created_at_id_idx"
ON "transfers"("created_at", "id");

DROP INDEX "payments_destination_account_id_idx";
CREATE INDEX "payments_destination_account_id_created_at_id_idx"
ON "payments"("destination_account_id", "created_at", "id");
