CREATE TYPE "public"."sync_status" AS ENUM('queued', 'running', 'done', 'error');--> statement-breakpoint
CREATE TABLE "playlist_files" (
	"playlist_id" uuid PRIMARY KEY NOT NULL,
	"gz_data" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playlist_id" uuid NOT NULL,
	"gen" integer NOT NULL,
	"phase" text NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"status" "sync_status" DEFAULT 'queued' NOT NULL,
	"lease_until" timestamp with time zone,
	"error" text,
	"invocations" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "sync_gen" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "sync_gen" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "sync_gen" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "sync_gen" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "playlists" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "sync_gen" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vod_items" ADD COLUMN "sync_gen" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "playlist_files" ADD CONSTRAINT "playlist_files_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_jobs_playlist_idx" ON "sync_jobs" USING btree ("playlist_id","created_at");