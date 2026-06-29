CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"exam_center_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"subject" text NOT NULL,
	"order_type" text NOT NULL,
	"order_key" text,
	"status" text NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_exam_center_id_exam_centers_id_fk" FOREIGN KEY ("exam_center_id") REFERENCES "public"."exam_centers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_logs_org_idx" ON "email_logs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "email_logs_exam_center_idx" ON "email_logs" USING btree ("exam_center_id");--> statement-breakpoint
CREATE INDEX "email_logs_sent_at_idx" ON "email_logs" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "email_logs_daily_usage_idx" ON "email_logs" USING btree ("exam_center_id","sent_at");