CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"audience" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_key_unique" UNIQUE("key"),
	CONSTRAINT "plans_audience_check" CHECK ("plans"."audience" in ('user', 'tenant'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plans_default_per_audience" ON "plans" USING btree ("audience") WHERE "plans"."is_default";
--> statement-breakpoint
INSERT INTO "plans" ("id", "key", "name", "audience", "is_default", "sort") VALUES ('01930000-0000-7000-8000-000000000001', 'free', 'Free', 'user', true, 0);
