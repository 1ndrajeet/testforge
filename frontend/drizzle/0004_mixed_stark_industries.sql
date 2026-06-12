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
DROP INDEX "payments_payment_idx";--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "subscription_tier" SET DEFAULT 'trial';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "promo_code_id" uuid;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_used_by_org_id_organizations_id_fk" FOREIGN KEY ("used_by_org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_order_idx" ON "payments" USING btree ("razorpay_order_id");