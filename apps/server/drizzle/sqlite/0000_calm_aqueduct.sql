CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `banner` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`href` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`points_spent` integer DEFAULT 0 NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `banner_status_idx` ON `banner` (`status`);--> statement-breakpoint
CREATE INDEX `banner_user_idx` ON `banner` (`user_id`);--> statement-breakpoint
CREATE INDEX `banner_window_idx` ON `banner` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `captcha_challenge` (
	`id` text PRIMARY KEY NOT NULL,
	`answer_hash` text NOT NULL,
	`provider` text DEFAULT 'builtin' NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`verified_at` integer,
	`token_used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `captcha_challenge_expires_idx` ON `captcha_challenge` (`expires_at`);--> statement-breakpoint
CREATE INDEX `captcha_challenge_token_used_idx` ON `captcha_challenge` (`token_used_at`);--> statement-breakpoint
CREATE TABLE `category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`parent_id` integer,
	FOREIGN KEY (`parent_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_slug_unique` ON `category` (`slug`);--> statement-breakpoint
CREATE TABLE `daily_checkin` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`checkin_on` text NOT NULL,
	`streak` integer DEFAULT 1 NOT NULL,
	`xp_awarded` integer DEFAULT 0 NOT NULL,
	`points_awarded` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_checkin_user_day_unique` ON `daily_checkin` (`user_id`,`checkin_on`);--> statement-breakpoint
CREATE INDEX `daily_checkin_day_idx` ON `daily_checkin` (`checkin_on`);--> statement-breakpoint
CREATE TABLE `game_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_uuid` text NOT NULL,
	`server_id` text NOT NULL,
	`ip` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_session_player_server_unique` ON `game_session` (`player_uuid`,`server_id`);--> statement-breakpoint
CREATE INDEX `game_session_server_id_idx` ON `game_session` (`server_id`);--> statement-breakpoint
CREATE INDEX `game_session_expires_at_idx` ON `game_session` (`expires_at`);--> statement-breakpoint
CREATE TABLE `moderation_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `nickname_reservation` (
	`nickname` text PRIMARY KEY NOT NULL,
	`player_uuid` text NOT NULL,
	`reserved_until` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `nickname_reservation_player_uuid_idx` ON `nickname_reservation` (`player_uuid`);--> statement-breakpoint
CREATE INDEX `nickname_reservation_reserved_until_idx` ON `nickname_reservation` (`reserved_until`);--> statement-breakpoint
CREATE TABLE `notification` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`message` text,
	`link` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notification_user_id_idx` ON `notification` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_read_at_idx` ON `notification` (`read_at`);--> statement-breakpoint
CREATE INDEX `notification_user_read_idx` ON `notification` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notification_user_read_created_idx` ON `notification` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `oauth_code` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text,
	`redirect_uri` text NOT NULL,
	`scope` text,
	`code_challenge` text,
	`code_challenge_method` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_code_code_hash_unique` ON `oauth_code` (`code_hash`);--> statement-breakpoint
CREATE INDEX `oauth_code_user_id_idx` ON `oauth_code` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_code_expires_at_idx` ON `oauth_code` (`expires_at`);--> statement-breakpoint
CREATE TABLE `player` (
	`uuid` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`nickname` text NOT NULL,
	`nickname_history` text NOT NULL,
	`previous_nickname` text,
	`name_cooldown_at` integer,
	`banned` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_user_id_unique` ON `player` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `player_nickname_unique` ON `player` (`nickname`);--> statement-breakpoint
CREATE TABLE `point_transaction` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`memo` text,
	`ref_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `point_transaction_user_idx` ON `point_transaction` (`user_id`);--> statement-breakpoint
CREATE INDEX `point_transaction_created_idx` ON `point_transaction` (`created_at`);--> statement-breakpoint
CREATE TABLE `post` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`content_md` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`last_activity_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_category_id_idx` ON `post` (`category_id`);--> statement-breakpoint
CREATE INDEX `post_author_id_idx` ON `post` (`author_id`);--> statement-breakpoint
CREATE INDEX `post_status_idx` ON `post` (`status`);--> statement-breakpoint
CREATE INDEX `post_status_last_activity_idx` ON `post` (`status`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `post_category_status_activity_idx` ON `post` (`category_id`,`status`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `post_pinned_idx` ON `post` (`pinned`);--> statement-breakpoint
CREATE INDEX `post_last_activity_at_idx` ON `post` (`last_activity_at`);--> statement-breakpoint
CREATE TABLE `reply` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`author_id` text NOT NULL,
	`content_md` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`floor` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `post`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reply_post_id_idx` ON `reply` (`post_id`);--> statement-breakpoint
CREATE INDEX `reply_post_status_floor_idx` ON `reply` (`post_id`,`status`,`floor`);--> statement-breakpoint
CREATE INDEX `reply_author_id_idx` ON `reply` (`author_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reply_post_floor_unique` ON `reply` (`post_id`,`floor`);--> statement-breakpoint
CREATE TABLE `report` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reporter_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`handled_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`handled_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `report_status_idx` ON `report` (`status`);--> statement-breakpoint
CREATE TABLE `server_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`server_id` text NOT NULL,
	`name` text NOT NULL,
	`secret` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_entry_server_id_unique` ON `server_entry` (`server_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `site_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `skin` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_uuid` text NOT NULL,
	`kind` text NOT NULL,
	`variant` text,
	`file_path` text NOT NULL,
	`sha256` text NOT NULL,
	`texture_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`active_slot` text,
	`uploaded_at` integer NOT NULL,
	`reviewed_by` text,
	FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `skin_player_uuid_idx` ON `skin` (`player_uuid`);--> statement-breakpoint
CREATE INDEX `skin_sha256_idx` ON `skin` (`sha256`);--> statement-breakpoint
CREATE INDEX `skin_status_idx` ON `skin` (`status`);--> statement-breakpoint
CREATE INDEX `skin_is_active_idx` ON `skin` (`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `skin_active_unique_idx` ON `skin` (`player_uuid`,`kind`,`active_slot`);--> statement-breakpoint
CREATE UNIQUE INDEX `skin_player_kind_sha_unique` ON `skin` (`player_uuid`,`kind`,`sha256`);--> statement-breakpoint
CREATE TABLE `title` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'special' NOT NULL,
	`description` text,
	`color` text DEFAULT '#8b5cf6' NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `title_name_unique` ON `title` (`name`);--> statement-breakpoint
CREATE TABLE `title_application` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`proposed_name` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result_title_id` integer,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`result_title_id`) REFERENCES `title`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `title_application_status_idx` ON `title_application` (`status`);--> statement-breakpoint
CREATE INDEX `title_application_user_idx` ON `title_application` (`user_id`);--> statement-breakpoint
CREATE TABLE `token` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_uuid` text NOT NULL,
	`access_token_hash` text NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`client_token_hash` text,
	`device_name` text,
	`ip` text,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `token_access_token_hash_unique` ON `token` (`access_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `token_refresh_token_hash_unique` ON `token` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `token_player_uuid_idx` ON `token` (`player_uuid`);--> statement-breakpoint
CREATE INDEX `token_expires_at_idx` ON `token` (`expires_at`);--> statement-breakpoint
CREATE TABLE `upload_usage` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`role` text DEFAULT 'user' NOT NULL,
	`banned` integer DEFAULT false NOT NULL,
	`muted_until` integer,
	`signature` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_name_unique` ON `user` (`name`);--> statement-breakpoint
CREATE TABLE `user_permission` (
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	`granted_by` text,
	`granted_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `permission`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `user_permission_user_idx` ON `user_permission` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_progress` (
	`user_id` text PRIMARY KEY NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`checkin_streak` integer DEFAULT 0 NOT NULL,
	`last_checkin_on` text,
	`total_checkins` integer DEFAULT 0 NOT NULL,
	`xp_boost_until` integer,
	`cape_unlocked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_progress_xp_idx` ON `user_progress` (`xp`);--> statement-breakpoint
CREATE INDEX `user_progress_points_idx` ON `user_progress` (`points`);--> statement-breakpoint
CREATE TABLE `user_title` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`title_id` integer NOT NULL,
	`granted_by` text,
	`granted_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`title_id`) REFERENCES `title`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_title_user_title_unique` ON `user_title` (`user_id`,`title_id`);--> statement-breakpoint
CREATE INDEX `user_title_user_idx` ON `user_title` (`user_id`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `vote` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vote_user_target_unique_idx` ON `vote` (`user_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `vote_target_idx` ON `vote` (`target_type`,`target_id`);