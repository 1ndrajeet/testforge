DROP INDEX IF EXISTS "upload_status_exam_center_file_type_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "upload_exam_center_file_type_institute_idx" ON "uploads" USING btree ("exam_center_id","file_type","connected_institute_id") WHERE "connected_institute_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "upload_exam_center_file_type_null_institute_idx" ON "uploads" USING btree ("exam_center_id","file_type") WHERE "connected_institute_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "upload_status_exam_center_institute_idx" ON "uploads" USING btree ("exam_center_id","connected_institute_id");
