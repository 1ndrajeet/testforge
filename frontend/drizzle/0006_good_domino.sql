ALTER TABLE "block_allocations" ADD COLUMN "connected_institute_id" uuid;--> statement-breakpoint
ALTER TABLE "block_allocations" ADD COLUMN "institute_code" text;--> statement-breakpoint
ALTER TABLE "block_allocations" ADD COLUMN "institute_name" text;--> statement-breakpoint
ALTER TABLE "block_allocations" ADD CONSTRAINT "block_allocations_connected_institute_id_connected_institutes_id_fk" FOREIGN KEY ("connected_institute_id") REFERENCES "public"."connected_institutes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alloc_institute_idx" ON "block_allocations" USING btree ("connected_institute_id");