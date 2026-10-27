CREATE TABLE "account" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"account_id" varchar(191) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banner" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"title" varchar(64) NOT NULL,
	"description" text,
	"href" varchar(255),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"points_spent" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"reviewed_by" varchar(191),
	"reviewed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captcha_challenge" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"answer_hash" varchar(128) NOT NULL,
	"provider" varchar(32) DEFAULT 'builtin' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp,
	"token_used_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"parent_id" integer,
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "daily_checkin" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"checkin_on" varchar(10) NOT NULL,
	"streak" integer DEFAULT 1 NOT NULL,
	"xp_awarded" integer DEFAULT 0 NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_uuid" varchar(64) NOT NULL,
	"server_id" varchar(128) NOT NULL,
	"ip" varchar(64),
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" varchar(191),
	"action" varchar(32) NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" varchar(191) NOT NULL,
	"reason" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nickname_reservation" (
	"nickname" varchar(64) PRIMARY KEY NOT NULL,
	"player_uuid" varchar(64) NOT NULL,
	"reserved_until" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"type" varchar(32) NOT NULL,
	"actor_id" varchar(191),
	"message" text,
	"link" varchar(255),
	"read_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_code" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"client_id" varchar(191),
	"redirect_uri" text NOT NULL,
	"scope" text,
	"code_challenge" varchar(128),
	"code_challenge_method" varchar(32),
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "oauth_code_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "player" (
	"uuid" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"nickname" varchar(64) NOT NULL,
	"nickname_history" jsonb NOT NULL,
	"previous_nickname" varchar(64),
	"name_cooldown_at" timestamp,
	"banned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "player_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "player_nickname_unique" UNIQUE("nickname")
);
--> statement-breakpoint
CREATE TABLE "point_transaction" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" varchar(32) NOT NULL,
	"memo" text,
	"ref_id" varchar(191),
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"author_id" varchar(191) NOT NULL,
	"title" varchar(255) NOT NULL,
	"content_md" text NOT NULL,
	"status" varchar(32) DEFAULT 'published' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"last_activity_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reply" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"author_id" varchar(191) NOT NULL,
	"content_md" text NOT NULL,
	"status" varchar(32) DEFAULT 'published' NOT NULL,
	"floor" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" varchar(191) NOT NULL,
	"reporter_id" varchar(191) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"handled_by" varchar(191),
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_entry" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" varchar(128) NOT NULL,
	"name" varchar(128) NOT NULL,
	"secret" varchar(128) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "server_entry_server_id_unique" UNIQUE("server_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" varchar(255) NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"user_id" varchar(191) NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "site_setting" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"updated_by" varchar(191)
);
--> statement-breakpoint
CREATE TABLE "skin" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_uuid" varchar(64) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"variant" varchar(32),
	"file_path" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"texture_url" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"active_slot" varchar(128),
	"uploaded_at" timestamp NOT NULL,
	"reviewed_by" varchar(191)
);
--> statement-breakpoint
CREATE TABLE "title" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"kind" varchar(32) DEFAULT 'special' NOT NULL,
	"description" text,
	"color" varchar(16) DEFAULT '#8b5cf6' NOT NULL,
	"created_by" varchar(191),
	"created_at" timestamp NOT NULL,
	CONSTRAINT "title_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "title_application" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"proposed_name" varchar(64) NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"result_title_id" integer,
	"reviewed_by" varchar(191),
	"reviewed_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_uuid" varchar(64) NOT NULL,
	"access_token_hash" varchar(128) NOT NULL,
	"refresh_token_hash" varchar(128) NOT NULL,
	"client_token_hash" varchar(128),
	"device_name" varchar(128),
	"ip" varchar(64),
	"expires_at" timestamp NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "token_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "token_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "upload_usage" (
	"user_id" varchar(191) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"day" varchar(10) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "upload_usage_user_id_kind_day_pk" PRIMARY KEY("user_id","kind","day")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" varchar(64) NOT NULL,
	"avatar_url" text,
	"role" varchar(32) DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"muted_until" timestamp,
	"signature" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_permission" (
	"user_id" varchar(191) NOT NULL,
	"permission" varchar(32) NOT NULL,
	"granted_by" varchar(191),
	"granted_at" timestamp NOT NULL,
	CONSTRAINT "user_permission_user_id_permission_pk" PRIMARY KEY("user_id","permission")
);
--> statement-breakpoint
CREATE TABLE "user_progress" (
	"user_id" varchar(191) PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"checkin_streak" integer DEFAULT 0 NOT NULL,
	"last_checkin_on" varchar(10),
	"total_checkins" integer DEFAULT 0 NOT NULL,
	"xp_boost_until" timestamp,
	"cape_unlocked_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_title" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"title_id" integer NOT NULL,
	"granted_by" varchar(191),
	"granted_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" varchar(191) PRIMARY KEY NOT NULL,
	"identifier" varchar(191) NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "vote" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply" ADD CONSTRAINT "reply_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_application" ADD CONSTRAINT "title_application_result_title_id_title_id_fk" FOREIGN KEY ("result_title_id") REFERENCES "public"."title"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_title" ADD CONSTRAINT "user_title_title_id_title_id_fk" FOREIGN KEY ("title_id") REFERENCES "public"."title"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "banner_status_idx" ON "banner" USING btree ("status");--> statement-breakpoint
CREATE INDEX "banner_user_idx" ON "banner" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "banner_window_idx" ON "banner" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "captcha_challenge_expires_idx" ON "captcha_challenge" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "captcha_challenge_token_used_idx" ON "captcha_challenge" USING btree ("token_used_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_checkin_user_day_unique" ON "daily_checkin" USING btree ("user_id","checkin_on");--> statement-breakpoint
CREATE INDEX "daily_checkin_day_idx" ON "daily_checkin" USING btree ("checkin_on");--> statement-breakpoint
CREATE UNIQUE INDEX "game_session_player_server_unique" ON "game_session" USING btree ("player_uuid","server_id");--> statement-breakpoint
CREATE INDEX "game_session_server_id_idx" ON "game_session" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "game_session_expires_at_idx" ON "game_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "nickname_reservation_player_uuid_idx" ON "nickname_reservation" USING btree ("player_uuid");--> statement-breakpoint
CREATE INDEX "nickname_reservation_reserved_until_idx" ON "nickname_reservation" USING btree ("reserved_until");--> statement-breakpoint
CREATE INDEX "notification_user_id_idx" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_read_at_idx" ON "notification" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "notification_user_read_idx" ON "notification" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notification_user_read_created_idx" ON "notification" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "oauth_code_user_id_idx" ON "oauth_code" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_code_expires_at_idx" ON "oauth_code" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "point_transaction_user_idx" ON "point_transaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "point_transaction_created_idx" ON "point_transaction" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "post_category_id_idx" ON "post" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "post_author_id_idx" ON "post" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "post_status_idx" ON "post" USING btree ("status");--> statement-breakpoint
CREATE INDEX "post_status_last_activity_idx" ON "post" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "post_category_status_activity_idx" ON "post" USING btree ("category_id","status","last_activity_at");--> statement-breakpoint
CREATE INDEX "post_pinned_idx" ON "post" USING btree ("pinned");--> statement-breakpoint
CREATE INDEX "post_last_activity_at_idx" ON "post" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "reply_post_id_idx" ON "reply" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "reply_post_status_floor_idx" ON "reply" USING btree ("post_id","status","floor");--> statement-breakpoint
CREATE INDEX "reply_author_id_idx" ON "reply" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reply_post_floor_unique" ON "reply" USING btree ("post_id","floor");--> statement-breakpoint
CREATE INDEX "report_status_idx" ON "report" USING btree ("status");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skin_player_uuid_idx" ON "skin" USING btree ("player_uuid");--> statement-breakpoint
CREATE INDEX "skin_sha256_idx" ON "skin" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "skin_status_idx" ON "skin" USING btree ("status");--> statement-breakpoint
CREATE INDEX "skin_is_active_idx" ON "skin" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "skin_active_unique_idx" ON "skin" USING btree ("player_uuid","kind","active_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "skin_player_kind_sha_unique" ON "skin" USING btree ("player_uuid","kind","sha256");--> statement-breakpoint
CREATE INDEX "title_application_status_idx" ON "title_application" USING btree ("status");--> statement-breakpoint
CREATE INDEX "title_application_user_idx" ON "title_application" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "token_player_uuid_idx" ON "token" USING btree ("player_uuid");--> statement-breakpoint
CREATE INDEX "token_expires_at_idx" ON "token" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_permission_user_idx" ON "user_permission" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_progress_xp_idx" ON "user_progress" USING btree ("xp");--> statement-breakpoint
CREATE INDEX "user_progress_points_idx" ON "user_progress" USING btree ("points");--> statement-breakpoint
CREATE UNIQUE INDEX "user_title_user_title_unique" ON "user_title" USING btree ("user_id","title_id");--> statement-breakpoint
CREATE INDEX "user_title_user_idx" ON "user_title" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_user_target_unique_idx" ON "vote" USING btree ("user_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "vote_target_idx" ON "vote" USING btree ("target_type","target_id");