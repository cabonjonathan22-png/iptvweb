CREATE TYPE "public"."content_kind" AS ENUM('live', 'vod', 'series');--> statement-breakpoint
CREATE TYPE "public"."player_mode" AS ENUM('auto', 'hls', 'ts');--> statement-breakpoint
CREATE TYPE "public"."playlist_status" AS ENUM('idle', 'syncing', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."playlist_type" AS ENUM('m3u_url', 'm3u_file', 'xtream');--> statement-breakpoint
CREATE TYPE "public"."progress_kind" AS ENUM('live', 'vod', 'episode');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"playlist_id" uuid NOT NULL,
	"kind" "content_kind" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"custom_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "channels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"playlist_id" uuid NOT NULL,
	"category_id" bigint,
	"external_id" text NOT NULL,
	"num" integer,
	"name" text NOT NULL,
	"logo" text,
	"stream_url" text,
	"epg_channel_id" text,
	"catchup" text,
	"catchup_days" integer,
	"http_user_agent" text,
	"http_referrer" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"playlist_id" uuid,
	"user_agent" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epg_programs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "epg_programs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"playlist_id" uuid NOT NULL,
	"channel_epg_id" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"stop" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "episodes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"series_id" bigint NOT NULL,
	"playlist_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"season" integer NOT NULL,
	"episode" integer NOT NULL,
	"title" text,
	"plot" text,
	"thumb" text,
	"duration_sec" integer,
	"container_ext" text,
	"stream_url" text
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" text NOT NULL,
	"kind" "content_kind" NOT NULL,
	"item_id" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_kind_item_id_pk" PRIMARY KEY("user_id","kind","item_id")
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "playlist_type" NOT NULL,
	"source_url" text,
	"credentials_enc" text,
	"epg_url" text,
	"epg_auto" boolean DEFAULT false NOT NULL,
	"status" "playlist_status" DEFAULT 'idle' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"live_count" integer DEFAULT 0 NOT NULL,
	"vod_count" integer DEFAULT 0 NOT NULL,
	"series_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "series_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"playlist_id" uuid NOT NULL,
	"category_id" bigint,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"poster" text,
	"backdrop" text,
	"plot" text,
	"year" integer,
	"rating" real,
	"cast" text,
	"genre" text,
	"tmdb_id" integer,
	"added_at" timestamp with time zone,
	"episodes_fetched_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"audio_lang" text,
	"subtitle_lang" text,
	"player_mode" "player_mode" DEFAULT 'auto' NOT NULL,
	"parental_pin_hash" text,
	"live_preview" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "vod_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vod_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"playlist_id" uuid NOT NULL,
	"category_id" bigint,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"poster" text,
	"backdrop" text,
	"plot" text,
	"year" integer,
	"duration_sec" integer,
	"rating" real,
	"cast" text,
	"genre" text,
	"container_ext" text,
	"stream_url" text,
	"tmdb_id" integer,
	"added_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_progress" (
	"user_id" text NOT NULL,
	"kind" "progress_kind" NOT NULL,
	"item_id" bigint NOT NULL,
	"position_sec" integer DEFAULT 0 NOT NULL,
	"duration_sec" integer,
	"completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_progress_user_id_kind_item_id_pk" PRIMARY KEY("user_id","kind","item_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epg_programs" ADD CONSTRAINT "epg_programs_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vod_items" ADD CONSTRAINT "vod_items_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vod_items" ADD CONSTRAINT "vod_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_ext_idx" ON "categories" USING btree ("playlist_id","kind","external_id");--> statement-breakpoint
CREATE INDEX "categories_order_idx" ON "categories" USING btree ("playlist_id","kind","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_ext_idx" ON "channels" USING btree ("playlist_id","external_id");--> statement-breakpoint
CREATE INDEX "channels_cat_idx" ON "channels" USING btree ("playlist_id","category_id","sort_order");--> statement-breakpoint
CREATE INDEX "channels_num_idx" ON "channels" USING btree ("playlist_id","num");--> statement-breakpoint
CREATE INDEX "channels_name_trgm_idx" ON "channels" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "devices_token_hash_idx" ON "devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "devices_user_idx" ON "devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "epg_lookup_idx" ON "epg_programs" USING btree ("playlist_id","channel_epg_id","start");--> statement-breakpoint
CREATE INDEX "epg_stop_idx" ON "epg_programs" USING btree ("stop");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_ext_idx" ON "episodes" USING btree ("series_id","external_id");--> statement-breakpoint
CREATE INDEX "episodes_order_idx" ON "episodes" USING btree ("series_id","season","episode");--> statement-breakpoint
CREATE INDEX "playlists_user_idx" ON "playlists" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "series_ext_idx" ON "series" USING btree ("playlist_id","external_id");--> statement-breakpoint
CREATE INDEX "series_cat_idx" ON "series" USING btree ("playlist_id","category_id","sort_order");--> statement-breakpoint
CREATE INDEX "series_name_trgm_idx" ON "series" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "vod_ext_idx" ON "vod_items" USING btree ("playlist_id","external_id");--> statement-breakpoint
CREATE INDEX "vod_cat_idx" ON "vod_items" USING btree ("playlist_id","category_id","sort_order");--> statement-breakpoint
CREATE INDEX "vod_added_idx" ON "vod_items" USING btree ("playlist_id","added_at");--> statement-breakpoint
CREATE INDEX "vod_name_trgm_idx" ON "vod_items" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "progress_recent_idx" ON "watch_progress" USING btree ("user_id","updated_at");