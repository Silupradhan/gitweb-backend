CREATE TYPE "public"."event_status" AS ENUM('received', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"full_name" text NOT NULL,
	"owner_login" text NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"web_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_github_repo_id_unique" UNIQUE("github_repo_id")
);
--> statement-breakpoint
CREATE TABLE "github_users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"github_user_id" bigint NOT NULL,
	"login" text NOT NULL,
	"avatar_url" text,
	"profile_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_users_github_user_id_unique" UNIQUE("github_user_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"action" varchar(100),
	"repository_id" bigint,
	"sender_id" bigint,
	"webhook_endpoint_id" text,
	"title" text,
	"source_url" text,
	"payload" jsonb NOT NULL,
	"status" "event_status" DEFAULT 'received' NOT NULL,
	"error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "events_delivery_id_unique" UNIQUE("delivery_id")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_sender_id_github_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."github_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_repo_received_idx" ON "events" USING btree ("repository_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "events_payload_gin_idx" ON "events" USING gin ("payload");