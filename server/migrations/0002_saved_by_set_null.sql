-- Forward-looking: under current write model, saved_by ≡ owner_id, so
-- versions are cascade-deleted via scene_id (step 3) before this fires.
-- SET NULL activates only if shared-editing lands (other users save versions).
ALTER TABLE "scene_versions" DROP CONSTRAINT "scene_versions_saved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "scene_versions" ALTER COLUMN "saved_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scene_versions" ADD CONSTRAINT "scene_versions_saved_by_users_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;