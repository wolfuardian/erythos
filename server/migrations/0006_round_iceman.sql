CREATE TABLE "scene_share_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"scene_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "scene_share_tokens" ADD CONSTRAINT "scene_share_tokens_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_share_tokens" ADD CONSTRAINT "scene_share_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scene_share_tokens_scene_idx" ON "scene_share_tokens" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "scene_share_tokens_active_idx" ON "scene_share_tokens" USING btree ("scene_id") WHERE revoked_at IS NULL;