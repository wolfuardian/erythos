-- assets table — content-addressed binary storage (refs #957 F-1b; spec docs/asset-sync-protocol.md)
-- Additive: CREATE TABLE only. No data touched.
-- Safe to deploy without user-data impact.
--
-- uploaded_by is nullable (spec literal says NOT NULL, but § Open Questions recommends
-- setting uploaded_by = NULL on account deletion rather than cascading deletes, aligning
-- with the scene_versions.saved_by SET NULL pattern).
CREATE TABLE "assets" (
	"hash" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"storage_url" text NOT NULL,
	"uploaded_by" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ref_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "assets_uploader_idx" ON "assets" USING btree ("uploaded_by");
