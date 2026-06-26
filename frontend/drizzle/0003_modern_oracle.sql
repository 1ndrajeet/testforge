CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"file_type" text NOT NULL,
	"original_filename" text NOT NULL,
	"stored_filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"file_size" integer NOT NULL,
	"status" text DEFAULT 'UPLOADED' NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "upload_status_exam_center_file_type_idx" ON "uploads" USING btree ("exam_center_id","file_type");--> statement-breakpoint
CREATE INDEX "upload_status_exam_center_idx" ON "uploads" USING btree ("exam_center_id");