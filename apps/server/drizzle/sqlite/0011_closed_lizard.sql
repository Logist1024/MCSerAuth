PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__bak_user_permission` AS SELECT * FROM `user_permission`;
--> statement-breakpoint
CREATE TABLE `__bak_banner` AS SELECT * FROM `banner`;
--> statement-breakpoint
CREATE TABLE `__bak_title_application` AS SELECT * FROM `title_application`;
--> statement-breakpoint
CREATE TABLE `__bak_user_title` AS SELECT * FROM `user_title`;
--> statement-breakpoint
CREATE TABLE `__bak_title` AS SELECT * FROM `title`;
--> statement-breakpoint
CREATE TABLE `__bak_point_transaction` AS SELECT * FROM `point_transaction`;
--> statement-breakpoint
CREATE TABLE `__bak_daily_checkin` AS SELECT * FROM `daily_checkin`;
--> statement-breakpoint
CREATE TABLE `__bak_user_progress` AS SELECT * FROM `user_progress`;
--> statement-breakpoint
CREATE TABLE `__bak_site_setting` AS SELECT * FROM `site_setting`;
--> statement-breakpoint
CREATE TABLE `__bak_upload_usage` AS SELECT * FROM `upload_usage`;
--> statement-breakpoint
CREATE TABLE `__bak_moderation_log` AS SELECT * FROM `moderation_log`;
--> statement-breakpoint
CREATE TABLE `__bak_notification` AS SELECT * FROM `notification`;
--> statement-breakpoint
CREATE TABLE `__bak_report` AS SELECT * FROM `report`;
--> statement-breakpoint
CREATE TABLE `__bak_vote` AS SELECT * FROM `vote`;
--> statement-breakpoint
CREATE TABLE `__bak_reply` AS SELECT * FROM `reply`;
--> statement-breakpoint
CREATE TABLE `__bak_post` AS SELECT * FROM `post`;
--> statement-breakpoint
CREATE TABLE `__bak_skin` AS SELECT * FROM `skin`;
--> statement-breakpoint
CREATE TABLE `__bak_game_session` AS SELECT * FROM `game_session`;
--> statement-breakpoint
CREATE TABLE `__bak_token` AS SELECT * FROM `token`;
--> statement-breakpoint
CREATE TABLE `__bak_nickname_reservation` AS SELECT * FROM `nickname_reservation`;
--> statement-breakpoint
CREATE TABLE `__bak_oauth_code` AS SELECT * FROM `oauth_code`;
--> statement-breakpoint
CREATE TABLE `__bak_player` AS SELECT * FROM `player`;
--> statement-breakpoint
CREATE TABLE `__bak_account` AS SELECT * FROM `account`;
--> statement-breakpoint
CREATE TABLE `__bak_session` AS SELECT * FROM `session`;
--> statement-breakpoint
DROP TABLE `user_permission`;
--> statement-breakpoint
DROP TABLE `banner`;
--> statement-breakpoint
DROP TABLE `title_application`;
--> statement-breakpoint
DROP TABLE `user_title`;
--> statement-breakpoint
DROP TABLE `title`;
--> statement-breakpoint
DROP TABLE `point_transaction`;
--> statement-breakpoint
DROP TABLE `daily_checkin`;
--> statement-breakpoint
DROP TABLE `user_progress`;
--> statement-breakpoint
DROP TABLE `site_setting`;
--> statement-breakpoint
DROP TABLE `upload_usage`;
--> statement-breakpoint
DROP TABLE `moderation_log`;
--> statement-breakpoint
DROP TABLE `notification`;
--> statement-breakpoint
DROP TABLE `report`;
--> statement-breakpoint
DROP TABLE `vote`;
--> statement-breakpoint
DROP TABLE `reply`;
--> statement-breakpoint
DROP TABLE `post`;
--> statement-breakpoint
DROP TABLE `skin`;
--> statement-breakpoint
DROP TABLE `game_session`;
--> statement-breakpoint
DROP TABLE `token`;
--> statement-breakpoint
DROP TABLE `nickname_reservation`;
--> statement-breakpoint
DROP TABLE `oauth_code`;
--> statement-breakpoint
DROP TABLE `player`;
--> statement-breakpoint
DROP TABLE `account`;
--> statement-breakpoint
DROP TABLE `session`;
--> statement-breakpoint
CREATE TABLE `__new_session` (
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
ALTER TABLE `__new_session` RENAME TO `session`;
--> statement-breakpoint
CREATE TABLE `__new_account` (
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
ALTER TABLE `__new_account` RENAME TO `account`;
--> statement-breakpoint
CREATE TABLE `__new_player` (
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
ALTER TABLE `__new_player` RENAME TO `player`;
--> statement-breakpoint
CREATE TABLE `__new_oauth_code` (
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
ALTER TABLE `__new_oauth_code` RENAME TO `oauth_code`;
--> statement-breakpoint
CREATE TABLE `__new_nickname_reservation` (
	`nickname` text PRIMARY KEY NOT NULL,
	`player_uuid` text NOT NULL,
	`reserved_until` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `__new_nickname_reservation` RENAME TO `nickname_reservation`;
--> statement-breakpoint
CREATE TABLE `__new_token` (
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
ALTER TABLE `__new_token` RENAME TO `token`;
--> statement-breakpoint
CREATE TABLE `__new_game_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_uuid` text NOT NULL,
	`server_id` text NOT NULL,
	`ip` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `__new_game_session` RENAME TO `game_session`;
--> statement-breakpoint
CREATE TABLE `__new_skin` (
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
ALTER TABLE `__new_skin` RENAME TO `skin`;
--> statement-breakpoint
CREATE TABLE `__new_post` (
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
ALTER TABLE `__new_post` RENAME TO `post`;
--> statement-breakpoint
CREATE TABLE `__new_reply` (
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
ALTER TABLE `__new_reply` RENAME TO `reply`;
--> statement-breakpoint
CREATE TABLE `__new_vote` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `__new_vote` RENAME TO `vote`;
--> statement-breakpoint
CREATE TABLE `__new_report` (
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
ALTER TABLE `__new_report` RENAME TO `report`;
--> statement-breakpoint
CREATE TABLE `__new_notification` (
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
ALTER TABLE `__new_notification` RENAME TO `notification`;
--> statement-breakpoint
CREATE TABLE `__new_moderation_log` (
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
ALTER TABLE `__new_moderation_log` RENAME TO `moderation_log`;
--> statement-breakpoint
CREATE TABLE `__new_upload_usage` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `__new_upload_usage` RENAME TO `upload_usage`;
--> statement-breakpoint
CREATE TABLE `__new_site_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `__new_site_setting` RENAME TO `site_setting`;
--> statement-breakpoint
CREATE TABLE `__new_user_progress` (
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
ALTER TABLE `__new_user_progress` RENAME TO `user_progress`;
--> statement-breakpoint
CREATE TABLE `__new_daily_checkin` (
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
ALTER TABLE `__new_daily_checkin` RENAME TO `daily_checkin`;
--> statement-breakpoint
CREATE TABLE `__new_point_transaction` (
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
ALTER TABLE `__new_point_transaction` RENAME TO `point_transaction`;
--> statement-breakpoint
CREATE TABLE `__new_title` (
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
ALTER TABLE `__new_title` RENAME TO `title`;
--> statement-breakpoint
CREATE TABLE `__new_user_title` (
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
ALTER TABLE `__new_user_title` RENAME TO `user_title`;
--> statement-breakpoint
CREATE TABLE `__new_title_application` (
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
ALTER TABLE `__new_title_application` RENAME TO `title_application`;
--> statement-breakpoint
CREATE TABLE `__new_banner` (
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
ALTER TABLE `__new_banner` RENAME TO `banner`;
--> statement-breakpoint
CREATE TABLE `__new_user_permission` (
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	`granted_by` text,
	`granted_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `permission`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `__new_user_permission` RENAME TO `user_permission`;
--> statement-breakpoint
INSERT INTO `session`("id", "expires_at", "token", "created_at", "updated_at", "ip_address", "user_agent", "user_id") SELECT "id", "expires_at", "token", "created_at", "updated_at", "ip_address", "user_agent", "user_id" FROM `__bak_session`;
--> statement-breakpoint
INSERT INTO `account`("id", "account_id", "provider_id", "user_id", "access_token", "refresh_token", "id_token", "access_token_expires_at", "refresh_token_expires_at", "scope", "password", "created_at", "updated_at") SELECT "id", "account_id", "provider_id", "user_id", "access_token", "refresh_token", "id_token", "access_token_expires_at", "refresh_token_expires_at", "scope", "password", "created_at", "updated_at" FROM `__bak_account`;
--> statement-breakpoint
INSERT INTO `player`("uuid", "user_id", "nickname", "nickname_history", "previous_nickname", "name_cooldown_at", "banned", "created_at") SELECT "uuid", "user_id", "nickname", "nickname_history", "previous_nickname", "name_cooldown_at", "banned", "created_at" FROM `__bak_player`;
--> statement-breakpoint
INSERT INTO `oauth_code`("id", "code_hash", "user_id", "client_id", "redirect_uri", "scope", "code_challenge", "code_challenge_method", "expires_at", "used_at", "created_at") SELECT "id", "code_hash", "user_id", "client_id", "redirect_uri", "scope", "code_challenge", "code_challenge_method", "expires_at", "used_at", "created_at" FROM `__bak_oauth_code`;
--> statement-breakpoint
INSERT INTO `nickname_reservation`("nickname", "player_uuid", "reserved_until", "created_at") SELECT "nickname", "player_uuid", "reserved_until", "created_at" FROM `__bak_nickname_reservation`;
--> statement-breakpoint
INSERT INTO `token`("id", "player_uuid", "access_token_hash", "refresh_token_hash", "client_token_hash", "device_name", "ip", "expires_at", "last_used_at", "revoked_at", "created_at") SELECT "id", "player_uuid", "access_token_hash", "refresh_token_hash", "client_token_hash", "device_name", "ip", "expires_at", "last_used_at", "revoked_at", "created_at" FROM `__bak_token`;
--> statement-breakpoint
INSERT INTO `game_session`("id", "player_uuid", "server_id", "ip", "created_at", "expires_at") SELECT "id", "player_uuid", "server_id", "ip", "created_at", "expires_at" FROM `__bak_game_session`;
--> statement-breakpoint
INSERT INTO `skin`("id", "player_uuid", "kind", "variant", "file_path", "sha256", "texture_url", "status", "is_active", "active_slot", "uploaded_at", "reviewed_by") SELECT "id", "player_uuid", "kind", "variant", "file_path", "sha256", "texture_url", "status", "is_active", "active_slot", "uploaded_at", "reviewed_by" FROM `__bak_skin`;
--> statement-breakpoint
INSERT INTO `post`("id", "category_id", "author_id", "title", "content_md", "status", "pinned", "featured", "locked", "last_activity_at", "created_at") SELECT "id", "category_id", "author_id", "title", "content_md", "status", "pinned", "featured", "locked", "last_activity_at", "created_at" FROM `__bak_post`;
--> statement-breakpoint
INSERT INTO `reply`("id", "post_id", "author_id", "content_md", "status", "floor", "created_at") SELECT "id", "post_id", "author_id", "content_md", "status", "floor", "created_at" FROM `__bak_reply`;
--> statement-breakpoint
INSERT INTO `vote`("id", "user_id", "target_type", "target_id", "created_at") SELECT "id", "user_id", "target_type", "target_id", "created_at" FROM `__bak_vote`;
--> statement-breakpoint
INSERT INTO `report`("id", "target_type", "target_id", "reporter_id", "reason", "status", "handled_by", "created_at") SELECT "id", "target_type", "target_id", "reporter_id", "reason", "status", "handled_by", "created_at" FROM `__bak_report`;
--> statement-breakpoint
INSERT INTO `notification`("id", "user_id", "type", "actor_id", "message", "link", "read_at", "created_at") SELECT "id", "user_id", "type", "actor_id", "message", "link", "read_at", "created_at" FROM `__bak_notification`;
--> statement-breakpoint
INSERT INTO `moderation_log`("id", "actor_id", "action", "target_type", "target_id", "reason", "created_at") SELECT "id", "actor_id", "action", "target_type", "target_id", "reason", "created_at" FROM `__bak_moderation_log`;
--> statement-breakpoint
INSERT INTO `upload_usage`("user_id", "kind", "day", "count") SELECT "user_id", "kind", "day", "count" FROM `__bak_upload_usage`;
--> statement-breakpoint
INSERT INTO `site_setting`("key", "value", "updated_at", "updated_by") SELECT "key", "value", "updated_at", "updated_by" FROM `__bak_site_setting`;
--> statement-breakpoint
INSERT INTO `user_progress`("user_id", "xp", "level", "points", "checkin_streak", "last_checkin_on", "total_checkins", "xp_boost_until", "cape_unlocked_at", "created_at", "updated_at") SELECT "user_id", "xp", "level", "points", "checkin_streak", "last_checkin_on", "total_checkins", "xp_boost_until", "cape_unlocked_at", "created_at", "updated_at" FROM `__bak_user_progress`;
--> statement-breakpoint
INSERT INTO `daily_checkin`("id", "user_id", "checkin_on", "streak", "xp_awarded", "points_awarded", "created_at") SELECT "id", "user_id", "checkin_on", "streak", "xp_awarded", "points_awarded", "created_at" FROM `__bak_daily_checkin`;
--> statement-breakpoint
INSERT INTO `point_transaction`("id", "user_id", "amount", "balance_after", "reason", "memo", "ref_id", "created_at") SELECT "id", "user_id", "amount", "balance_after", "reason", "memo", "ref_id", "created_at" FROM `__bak_point_transaction`;
--> statement-breakpoint
INSERT INTO `title`("id", "name", "kind", "description", "color", "created_by", "created_at") SELECT "id", "name", "kind", "description", "color", "created_by", "created_at" FROM `__bak_title`;
--> statement-breakpoint
INSERT INTO `user_title`("id", "user_id", "title_id", "granted_by", "granted_at") SELECT "id", "user_id", "title_id", "granted_by", "granted_at" FROM `__bak_user_title`;
--> statement-breakpoint
INSERT INTO `title_application`("id", "user_id", "proposed_name", "reason", "status", "result_title_id", "reviewed_by", "reviewed_at", "created_at") SELECT "id", "user_id", "proposed_name", "reason", "status", "result_title_id", "reviewed_by", "reviewed_at", "created_at" FROM `__bak_title_application`;
--> statement-breakpoint
INSERT INTO `banner`("id", "user_id", "title", "description", "href", "status", "points_spent", "starts_at", "ends_at", "reviewed_by", "reviewed_at", "created_at") SELECT "id", "user_id", "title", "description", "href", "status", "points_spent", "starts_at", "ends_at", "reviewed_by", "reviewed_at", "created_at" FROM `__bak_banner`;
--> statement-breakpoint
INSERT INTO `user_permission`("user_id", "permission", "granted_by", "granted_at") SELECT "user_id", "permission", "granted_by", "granted_at" FROM `__bak_user_permission`;
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);
--> statement-breakpoint
CREATE INDEX `banner_status_idx` ON `banner` (`status`);
--> statement-breakpoint
CREATE INDEX `banner_user_idx` ON `banner` (`user_id`);
--> statement-breakpoint
CREATE INDEX `banner_window_idx` ON `banner` (`starts_at`,`ends_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_checkin_user_day_unique` ON `daily_checkin` (`user_id`,`checkin_on`);
--> statement-breakpoint
CREATE INDEX `daily_checkin_day_idx` ON `daily_checkin` (`checkin_on`);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_session_player_server_unique` ON `game_session` (`player_uuid`,`server_id`);
--> statement-breakpoint
CREATE INDEX `game_session_server_id_idx` ON `game_session` (`server_id`);
--> statement-breakpoint
CREATE INDEX `game_session_expires_at_idx` ON `game_session` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `nickname_reservation_player_uuid_idx` ON `nickname_reservation` (`player_uuid`);
--> statement-breakpoint
CREATE INDEX `nickname_reservation_reserved_until_idx` ON `nickname_reservation` (`reserved_until`);
--> statement-breakpoint
CREATE INDEX `notification_user_id_idx` ON `notification` (`user_id`);
--> statement-breakpoint
CREATE INDEX `notification_read_at_idx` ON `notification` (`read_at`);
--> statement-breakpoint
CREATE INDEX `notification_user_read_idx` ON `notification` (`user_id`,`read_at`);
--> statement-breakpoint
CREATE INDEX `notification_user_read_created_idx` ON `notification` (`user_id`,`read_at`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_code_code_hash_unique` ON `oauth_code` (`code_hash`);
--> statement-breakpoint
CREATE INDEX `oauth_code_user_id_idx` ON `oauth_code` (`user_id`);
--> statement-breakpoint
CREATE INDEX `oauth_code_expires_at_idx` ON `oauth_code` (`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_user_id_unique` ON `player` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_nickname_unique` ON `player` (`nickname`);
--> statement-breakpoint
CREATE INDEX `point_transaction_user_idx` ON `point_transaction` (`user_id`);
--> statement-breakpoint
CREATE INDEX `point_transaction_created_idx` ON `point_transaction` (`created_at`);
--> statement-breakpoint
CREATE INDEX `post_category_id_idx` ON `post` (`category_id`);
--> statement-breakpoint
CREATE INDEX `post_author_id_idx` ON `post` (`author_id`);
--> statement-breakpoint
CREATE INDEX `post_status_idx` ON `post` (`status`);
--> statement-breakpoint
CREATE INDEX `post_status_last_activity_idx` ON `post` (`status`,`last_activity_at`);
--> statement-breakpoint
CREATE INDEX `post_category_status_activity_idx` ON `post` (`category_id`,`status`,`last_activity_at`);
--> statement-breakpoint
CREATE INDEX `post_pinned_idx` ON `post` (`pinned`);
--> statement-breakpoint
CREATE INDEX `post_last_activity_at_idx` ON `post` (`last_activity_at`);
--> statement-breakpoint
CREATE INDEX `reply_post_id_idx` ON `reply` (`post_id`);
--> statement-breakpoint
CREATE INDEX `reply_post_status_floor_idx` ON `reply` (`post_id`,`status`,`floor`);
--> statement-breakpoint
CREATE INDEX `reply_author_id_idx` ON `reply` (`author_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `reply_post_floor_unique` ON `reply` (`post_id`,`floor`);
--> statement-breakpoint
CREATE INDEX `report_status_idx` ON `report` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);
--> statement-breakpoint
CREATE INDEX `skin_player_uuid_idx` ON `skin` (`player_uuid`);
--> statement-breakpoint
CREATE INDEX `skin_sha256_idx` ON `skin` (`sha256`);
--> statement-breakpoint
CREATE INDEX `skin_status_idx` ON `skin` (`status`);
--> statement-breakpoint
CREATE INDEX `skin_is_active_idx` ON `skin` (`is_active`);
--> statement-breakpoint
CREATE UNIQUE INDEX `skin_active_unique_idx` ON `skin` (`player_uuid`,`kind`,`active_slot`);
--> statement-breakpoint
CREATE UNIQUE INDEX `skin_player_kind_sha_unique` ON `skin` (`player_uuid`,`kind`,`sha256`);
--> statement-breakpoint
CREATE UNIQUE INDEX `title_name_unique` ON `title` (`name`);
--> statement-breakpoint
CREATE INDEX `title_application_status_idx` ON `title_application` (`status`);
--> statement-breakpoint
CREATE INDEX `title_application_user_idx` ON `title_application` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `token_access_token_hash_unique` ON `token` (`access_token_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `token_refresh_token_hash_unique` ON `token` (`refresh_token_hash`);
--> statement-breakpoint
CREATE INDEX `token_player_uuid_idx` ON `token` (`player_uuid`);
--> statement-breakpoint
CREATE INDEX `token_expires_at_idx` ON `token` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `user_permission_user_idx` ON `user_permission` (`user_id`);
--> statement-breakpoint
CREATE INDEX `user_progress_xp_idx` ON `user_progress` (`xp`);
--> statement-breakpoint
CREATE INDEX `user_progress_points_idx` ON `user_progress` (`points`);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_title_user_title_unique` ON `user_title` (`user_id`,`title_id`);
--> statement-breakpoint
CREATE INDEX `user_title_user_idx` ON `user_title` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `vote_user_target_unique_idx` ON `vote` (`user_id`,`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `vote_target_idx` ON `vote` (`target_type`,`target_id`);
--> statement-breakpoint
DROP TABLE `__bak_user_permission`;
--> statement-breakpoint
DROP TABLE `__bak_banner`;
--> statement-breakpoint
DROP TABLE `__bak_title_application`;
--> statement-breakpoint
DROP TABLE `__bak_user_title`;
--> statement-breakpoint
DROP TABLE `__bak_title`;
--> statement-breakpoint
DROP TABLE `__bak_point_transaction`;
--> statement-breakpoint
DROP TABLE `__bak_daily_checkin`;
--> statement-breakpoint
DROP TABLE `__bak_user_progress`;
--> statement-breakpoint
DROP TABLE `__bak_site_setting`;
--> statement-breakpoint
DROP TABLE `__bak_upload_usage`;
--> statement-breakpoint
DROP TABLE `__bak_moderation_log`;
--> statement-breakpoint
DROP TABLE `__bak_notification`;
--> statement-breakpoint
DROP TABLE `__bak_report`;
--> statement-breakpoint
DROP TABLE `__bak_vote`;
--> statement-breakpoint
DROP TABLE `__bak_reply`;
--> statement-breakpoint
DROP TABLE `__bak_post`;
--> statement-breakpoint
DROP TABLE `__bak_skin`;
--> statement-breakpoint
DROP TABLE `__bak_game_session`;
--> statement-breakpoint
DROP TABLE `__bak_token`;
--> statement-breakpoint
DROP TABLE `__bak_nickname_reservation`;
--> statement-breakpoint
DROP TABLE `__bak_oauth_code`;
--> statement-breakpoint
DROP TABLE `__bak_player`;
--> statement-breakpoint
DROP TABLE `__bak_account`;
--> statement-breakpoint
DROP TABLE `__bak_session`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
