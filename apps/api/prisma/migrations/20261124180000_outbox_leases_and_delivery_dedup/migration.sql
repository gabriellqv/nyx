ALTER TABLE "outbox_events" ADD COLUMN "locked_at" TIMESTAMP(3);
ALTER TABLE "outbox_events" ADD COLUMN "locked_by" TEXT;

CREATE INDEX "outbox_events_status_locked_at_idx"
ON "outbox_events"("status", "locked_at");

WITH ranked_deliveries AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "endpoint_id", "outbox_event_id"
            ORDER BY CASE WHEN "status" = 'success' THEN 0 ELSE 1 END, "created_at" DESC, "id"
        ) AS row_number,
        SUM("attempts") OVER (PARTITION BY "endpoint_id", "outbox_event_id") AS total_attempts,
        BOOL_OR("status" = 'success') OVER (PARTITION BY "endpoint_id", "outbox_event_id") AS has_success
    FROM "webhook_deliveries"
)
UPDATE "webhook_deliveries" AS delivery
SET
    "attempts" = ranked.total_attempts,
    "status" = CASE WHEN ranked.has_success THEN 'success' ELSE delivery."status" END
FROM ranked_deliveries AS ranked
WHERE delivery."id" = ranked."id" AND ranked.row_number = 1;

WITH ranked_deliveries AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "endpoint_id", "outbox_event_id"
            ORDER BY CASE WHEN "status" = 'success' THEN 0 ELSE 1 END, "created_at" DESC, "id"
        ) AS row_number
    FROM "webhook_deliveries"
)
DELETE FROM "webhook_deliveries" AS delivery
USING ranked_deliveries AS ranked
WHERE delivery."id" = ranked."id" AND ranked.row_number > 1;

CREATE UNIQUE INDEX "webhook_deliveries_endpoint_id_outbox_event_id_key"
ON "webhook_deliveries"("endpoint_id", "outbox_event_id");
