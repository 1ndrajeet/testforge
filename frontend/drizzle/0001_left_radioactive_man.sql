CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"session" text NOT NULL,
	"timeslot" text,
	"block_no" text,
	"block_id" uuid,
	"location" text,
	"scheme" text NOT NULL,
	"subject_code" text NOT NULL,
	"subject_name" text NOT NULL,
	"seat_numbers" jsonb NOT NULL,
	"first_seat" integer,
	"last_seat" integer,
	"assigned_count" integer,
	"strength" integer,
	"supervisor_uid" text,
	"supervisor_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"location" text NOT NULL,
	"name" text NOT NULL,
	"strength" integer NOT NULL,
	"distribution" jsonb DEFAULT '[10,10,10,10]'::jsonb,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_institutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"institute_code" text NOT NULL,
	"institute_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "e_marksheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"sheet_no" text,
	"subject_name" text,
	"scheme" text,
	"subject_head" text,
	"paper_code" text,
	"file_name" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"officer_incharge" text,
	"sealing_supervisor" text,
	"dist_center_code" text,
	"dist_center_name" text,
	"season" text,
	"exam_year" integer,
	"start_date" timestamp,
	"end_date" timestamp,
	"departments" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"order_type" text NOT NULL,
	"date" timestamp,
	"session" text,
	"order_key" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qp_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"day" integer,
	"date" timestamp NOT NULL,
	"session" text NOT NULL,
	"subject_code" text NOT NULL,
	"expected_students" integer,
	"expected_packets" integer,
	"received_packets" integer DEFAULT 0,
	"received_qps" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"name" text NOT NULL,
	"department" text NOT NULL,
	"email" text,
	"staff_type" text NOT NULL,
	"role" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"connected_institute_id" uuid NOT NULL,
	"seat_number" integer NOT NULL,
	"enrollment_number" text,
	"name" text,
	"scheme" text,
	"subjects" jsonb DEFAULT '[]'::jsonb,
	"sub_codes" jsonb DEFAULT '[]'::jsonb,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"scheme" text NOT NULL,
	"abbr" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"subject_id" uuid,
	"date" timestamp NOT NULL,
	"session" text NOT NULL,
	"time_slot" text NOT NULL,
	"subject_code" text NOT NULL,
	"subject_name" text NOT NULL,
	"scheme" text NOT NULL,
	"subject_abbr" text,
	"total_students" integer DEFAULT 0,
	"absent_numbers" jsonb DEFAULT '[]'::jsonb,
	"cps_students" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "subscription_tier" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "owner_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "razorpay_customer_id" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_allocations" ADD CONSTRAINT "block_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_allocations" ADD CONSTRAINT "block_allocations_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_allocations" ADD CONSTRAINT "block_allocations_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_institutes" ADD CONSTRAINT "connected_institutes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_institutes" ADD CONSTRAINT "connected_institutes_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_marksheets" ADD CONSTRAINT "e_marksheets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_marksheets" ADD CONSTRAINT "e_marksheets_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_centers" ADD CONSTRAINT "exam_centers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qp_inventory" ADD CONSTRAINT "qp_inventory_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qp_inventory" ADD CONSTRAINT "qp_inventory_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_connected_institute_id_connected_institutes_id_fk" FOREIGN KEY ("connected_institute_id") REFERENCES "public"."connected_institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_org_time_idx" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alloc_unique_idx" ON "block_allocations" USING btree ("exam_center_id","date","session","block_id","subject_code");--> statement-breakpoint
CREATE INDEX "alloc_date_session_idx" ON "block_allocations" USING btree ("date","session");--> statement-breakpoint
CREATE INDEX "alloc_block_idx" ON "block_allocations" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "alloc_org_date_idx" ON "block_allocations" USING btree ("org_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "blocks_center_location_idx" ON "blocks" USING btree ("exam_center_id","location");--> statement-breakpoint
CREATE INDEX "blocks_org_idx" ON "blocks" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_inst_center_inst_idx" ON "connected_institutes" USING btree ("exam_center_id","institute_code");--> statement-breakpoint
CREATE INDEX "emarksheets_org_idx" ON "e_marksheets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "emarksheets_paper_code_idx" ON "e_marksheets" USING btree ("paper_code");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_centers_org_code_idx" ON "exam_centers" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "exam_centers_org_idx" ON "exam_centers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "orders_staff_idx" ON "orders" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "orders_date_idx" ON "orders" USING btree ("date");--> statement-breakpoint
CREATE INDEX "orders_org_idx" ON "orders" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qp_date_subject_idx" ON "qp_inventory" USING btree ("exam_center_id","date","session","subject_code");--> statement-breakpoint
CREATE INDEX "qp_org_idx" ON "qp_inventory" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_center_uid_idx" ON "staff" USING btree ("exam_center_id","uid");--> statement-breakpoint
CREATE INDEX "staff_type_idx" ON "staff" USING btree ("staff_type");--> statement-breakpoint
CREATE INDEX "staff_org_idx" ON "staff" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_center_seat_idx" ON "students" USING btree ("exam_center_id","seat_number");--> statement-breakpoint
CREATE INDEX "students_enrollment_idx" ON "students" USING btree ("enrollment_number");--> statement-breakpoint
CREATE INDEX "students_org_idx" ON "students" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_org_code_scheme_idx" ON "subjects" USING btree ("org_id","code","scheme");--> statement-breakpoint
CREATE INDEX "subjects_org_idx" ON "subjects" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tt_unique_idx" ON "timetable" USING btree ("exam_center_id","date","session","subject_code","scheme");--> statement-breakpoint
CREATE INDEX "tt_date_idx" ON "timetable" USING btree ("date");--> statement-breakpoint
CREATE INDEX "tt_center_date_idx" ON "timetable" USING btree ("exam_center_id","date");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_idx" ON "org_members" USING btree ("org_id","user_id");