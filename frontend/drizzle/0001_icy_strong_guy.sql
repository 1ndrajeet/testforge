DROP INDEX "alloc_date_session_idx";--> statement-breakpoint
CREATE INDEX "idx_block_allocations_date_session" ON "block_allocations" USING btree ("date","session");--> statement-breakpoint
CREATE INDEX "idx_block_allocations_center_date_session" ON "block_allocations" USING btree ("exam_center_id","date","session");--> statement-breakpoint
CREATE INDEX "idx_block_allocations_center_block" ON "block_allocations" USING btree ("exam_center_id","block_id");--> statement-breakpoint
CREATE INDEX "idx_blocks_center_active" ON "blocks" USING btree ("exam_center_id","is_deleted");--> statement-breakpoint
CREATE INDEX "idx_connected_institutes_center" ON "connected_institutes" USING btree ("exam_center_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_exam_centers_org_active" ON "exam_centers" USING btree ("org_id","is_active","is_deleted");--> statement-breakpoint
CREATE INDEX "idx_orders_center" ON "orders" USING btree ("exam_center_id");--> statement-breakpoint
CREATE INDEX "idx_qp_inventory_center" ON "qp_inventory" USING btree ("exam_center_id");--> statement-breakpoint
CREATE INDEX "idx_staff_center_type" ON "staff" USING btree ("exam_center_id","staff_type","is_deleted");--> statement-breakpoint
CREATE INDEX "idx_students_center_dept" ON "students" USING btree ("exam_center_id","scheme","is_deleted");--> statement-breakpoint
CREATE INDEX "idx_students_center_institute" ON "students" USING btree ("exam_center_id","connected_institute_id","is_deleted");--> statement-breakpoint
CREATE INDEX "idx_students_center_enrollment" ON "students" USING btree ("exam_center_id","enrollment_number") WHERE "students"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "idx_timetable_center_stats" ON "timetable" USING btree ("exam_center_id","date","session");--> statement-breakpoint
CREATE INDEX "idx_timetable_center_subject" ON "timetable" USING btree ("exam_center_id","subject_code","scheme");--> statement-breakpoint
CREATE INDEX "idx_timetable_center_cps" ON "timetable" USING btree ("exam_center_id") WHERE "timetable"."cps_students" IS NOT NULL AND "timetable"."cps_students" != '[]'::jsonb;--> statement-breakpoint
CREATE INDEX "idx_timetable_center_date_stats" ON "timetable" USING btree ("exam_center_id","date" DESC);