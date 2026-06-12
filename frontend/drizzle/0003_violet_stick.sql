ALTER TABLE "subjects" DROP CONSTRAINT "subjects_org_id_organizations_id_fk";
--> statement-breakpoint
DROP INDEX "subjects_org_code_scheme_idx";--> statement-breakpoint
DROP INDEX "subjects_org_idx";--> statement-breakpoint
ALTER TABLE "blocks" ADD COLUMN "block_no" text NOT NULL;--> statement-breakpoint
ALTER TABLE "connected_institutes" ADD COLUMN "is_active" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "designation" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "post_held_in_examination" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "institute_code" text;--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_code_scheme_idx" ON "subjects" USING btree ("code","scheme");--> statement-breakpoint
ALTER TABLE "subjects" DROP COLUMN "org_id";