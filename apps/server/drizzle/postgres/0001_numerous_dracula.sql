CREATE TABLE "oauth_client" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" varchar(191) NOT NULL,
	"client_secret_hash" varchar(128),
	"name" varchar(128) NOT NULL,
	"description" text,
	"redirect_uris" jsonb NOT NULL,
	"allowed_scopes" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"client_id" varchar(191) NOT NULL,
	"scope" text NOT NULL,
	"granted_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "token" ADD COLUMN "client_id" varchar(191);--> statement-breakpoint
ALTER TABLE "token" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_consent_user_client_unique" ON "oauth_consent" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "token_client_id_idx" ON "token" USING btree ("client_id");