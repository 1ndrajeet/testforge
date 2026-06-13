CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
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
	"exam_center_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"session" text NOT NULL,
	"timeslot" text,
	"block_id" uuid,
	"block_no" text,
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
	"exam_center_id" uuid NOT NULL,
	"block_no" text NOT NULL,
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
	"exam_center_id" uuid NOT NULL,
	"institute_code" text NOT NULL,
	"institute_name" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "e_marksheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" text NOT NULL,
	"subscription_tier" text DEFAULT 'inactive' NOT NULL,
	"subscription_expires_at" timestamp,
	"trial_started_at" timestamp,
	"trial_ends_at" timestamp,
	"razorpay_customer_id" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"plan_name" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text NOT NULL,
	"promo_code_id" uuid,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"amount" integer DEFAULT 100 NOT NULL,
	"is_used" boolean DEFAULT false,
	"used_by_org_id" uuid,
	"used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "qp_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"uid" text NOT NULL,
	"name" text NOT NULL,
	"department" text NOT NULL,
	"email" text,
	"staff_type" text NOT NULL,
	"role" text,
	"designation" text,
	"post_held_in_examination" text,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"connected_institute_id" uuid NOT NULL,
	"seat_number" integer NOT NULL,
	"institute_code" text,
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
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_allocations" ADD CONSTRAINT "block_allocations_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_allocations" ADD CONSTRAINT "block_allocations_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_institutes" ADD CONSTRAINT "connected_institutes_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_marksheets" ADD CONSTRAINT "e_marksheets_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_centers" ADD CONSTRAINT "exam_centers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_used_by_org_id_organizations_id_fk" FOREIGN KEY ("used_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qp_inventory" ADD CONSTRAINT "qp_inventory_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_connected_institute_id_connected_institutes_id_fk" FOREIGN KEY ("connected_institute_id") REFERENCES "public"."connected_institutes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable" ADD CONSTRAINT "timetable_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_org_time_idx" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alloc_unique_idx" ON "block_allocations" USING btree ("exam_center_id","date","session","block_id","subject_code");--> statement-breakpoint
CREATE INDEX "alloc_date_session_idx" ON "block_allocations" USING btree ("date","session");--> statement-breakpoint
CREATE INDEX "alloc_block_idx" ON "block_allocations" USING btree ("block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blocks_center_location_idx" ON "blocks" USING btree ("exam_center_id","location");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_inst_center_inst_idx" ON "connected_institutes" USING btree ("exam_center_id","institute_code");--> statement-breakpoint
CREATE INDEX "emarksheets_paper_code_idx" ON "e_marksheets" USING btree ("paper_code");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_center_org_unique" ON "exam_centers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "exam_centers_org_idx" ON "exam_centers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "orders_staff_idx" ON "orders" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "orders_date_idx" ON "orders" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_idx" ON "org_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "payments_org_idx" ON "payments" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_idx" ON "payments" USING btree ("razorpay_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qp_date_subject_idx" ON "qp_inventory" USING btree ("exam_center_id","date","session","subject_code");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_center_uid_idx" ON "staff" USING btree ("exam_center_id","uid");--> statement-breakpoint
CREATE INDEX "staff_type_idx" ON "staff" USING btree ("staff_type");--> statement-breakpoint
CREATE UNIQUE INDEX "students_center_seat_idx" ON "students" USING btree ("exam_center_id","seat_number");--> statement-breakpoint
CREATE INDEX "students_enrollment_idx" ON "students" USING btree ("enrollment_number");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_code_scheme_idx" ON "subjects" USING btree ("code","scheme");--> statement-breakpoint
CREATE UNIQUE INDEX "tt_unique_idx" ON "timetable" USING btree ("exam_center_id","date","session","subject_code","scheme");--> statement-breakpoint
CREATE INDEX "tt_date_idx" ON "timetable" USING btree ("date");--> statement-breakpoint
CREATE INDEX "tt_center_date_idx" ON "timetable" USING btree ("exam_center_id","date");