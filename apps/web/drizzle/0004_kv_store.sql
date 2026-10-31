CREATE TABLE "kv_store" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "kv_store_expires_idx" ON "kv_store" USING btree ("expires_at");