CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"plan_name" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"start_date" timestamp,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_org_idx" ON "payments" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_payment_idx" ON "payments" USING btree ("razorpay_payment_id");