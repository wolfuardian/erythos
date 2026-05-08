CREATE TABLE "scene_versions" (
	"scene_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" "bytea" NOT NULL,
	"body_size" integer NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_by" uuid NOT NULL,
	CONSTRAINT "scene_versions_scene_id_version_pk" PRIMARY KEY("scene_id","version")
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"body" "bytea" NOT NULL,
	"body_size" integer NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"forked_from" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"email" text NOT NULL,
	"github_login" text NOT NULL,
	"avatar_url" text,
	"handle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"storage_used" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "scene_versions" ADD CONSTRAINT "scene_versions_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_versions" ADD CONSTRAINT "scene_versions_saved_by_users_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_forked_from_scenes_id_fk" FOREIGN KEY ("forked_from") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenes_owner_idx" ON "scenes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "scenes_public_idx" ON "scenes" USING btree ("visibility") WHERE visibility = 'public';--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");