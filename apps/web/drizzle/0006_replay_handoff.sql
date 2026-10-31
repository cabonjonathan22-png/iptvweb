ALTER TABLE "channels" ADD COLUMN "catchup_source" text;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD COLUMN "device_id" uuid;--> statement-breakpoint
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;