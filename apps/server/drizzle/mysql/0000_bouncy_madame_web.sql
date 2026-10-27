CREATE TABLE `account` (
	`id` varchar(191) NOT NULL,
	`account_id` varchar(191) NOT NULL,
	`provider_id` varchar(64) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`password` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `banner` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`title` varchar(64) NOT NULL,
	`description` text,
	`href` varchar(255),
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`points_spent` int NOT NULL DEFAULT 0,
	`starts_at` datetime(3),
	`ends_at` datetime(3),
	`reviewed_by` varchar(191),
	`reviewed_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `banner_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `captcha_challenge` (
	`id` varchar(64) NOT NULL,
	`answer_hash` varchar(128) NOT NULL,
	`provider` varchar(32) NOT NULL DEFAULT 'builtin',
	`expires_at` datetime(3) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`verified_at` datetime(3),
	`token_used_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `captcha_challenge_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`description` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`parent_id` int,
	CONSTRAINT `category_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `daily_checkin` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`checkin_on` varchar(10) NOT NULL,
	`streak` int NOT NULL DEFAULT 1,
	`xp_awarded` int NOT NULL DEFAULT 0,
	`points_awarded` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `daily_checkin_id` PRIMARY KEY(`id`),
	CONSTRAINT `daily_checkin_user_day_unique` UNIQUE(`user_id`,`checkin_on`)
);
--> statement-breakpoint
CREATE TABLE `game_session` (
	`id` int AUTO_INCREMENT NOT NULL,
	`player_uuid` varchar(64) NOT NULL,
	`server_id` varchar(128) NOT NULL,
	`ip` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	CONSTRAINT `game_session_id` PRIMARY KEY(`id`),
	CONSTRAINT `game_session_player_server_unique` UNIQUE(`player_uuid`,`server_id`)
);
--> statement-breakpoint
CREATE TABLE `moderation_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actor_id` varchar(191),
	`action` varchar(32) NOT NULL,
	`target_type` varchar(32) NOT NULL,
	`target_id` varchar(191) NOT NULL,
	`reason` text,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `moderation_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `nickname_reservation` (
	`nickname` varchar(64) NOT NULL,
	`player_uuid` varchar(64) NOT NULL,
	`reserved_until` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `nickname_reservation_nickname` PRIMARY KEY(`nickname`)
);
--> statement-breakpoint
CREATE TABLE `notification` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`type` varchar(32) NOT NULL,
	`actor_id` varchar(191),
	`message` text,
	`link` varchar(255),
	`read_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `notification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oauth_code` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code_hash` varchar(128) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`client_id` varchar(191),
	`redirect_uri` text NOT NULL,
	`scope` text,
	`code_challenge` varchar(128),
	`code_challenge_method` varchar(32),
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `oauth_code_id` PRIMARY KEY(`id`),
	CONSTRAINT `oauth_code_code_hash_unique` UNIQUE(`code_hash`)
);
--> statement-breakpoint
CREATE TABLE `player` (
	`uuid` varchar(64) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`nickname` varchar(64) NOT NULL,
	`nickname_history` json NOT NULL,
	`previous_nickname` varchar(64),
	`name_cooldown_at` datetime(3),
	`banned` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `player_uuid` PRIMARY KEY(`uuid`),
	CONSTRAINT `player_user_id_unique` UNIQUE(`user_id`),
	CONSTRAINT `player_nickname_unique` UNIQUE(`nickname`)
);
--> statement-breakpoint
CREATE TABLE `point_transaction` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`amount` int NOT NULL,
	`balance_after` int NOT NULL,
	`reason` varchar(32) NOT NULL,
	`memo` text,
	`ref_id` varchar(191),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `point_transaction_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `post` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL,
	`author_id` varchar(191) NOT NULL,
	`title` varchar(255) NOT NULL,
	`content_md` text NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'published',
	`pinned` boolean NOT NULL DEFAULT false,
	`featured` boolean NOT NULL DEFAULT false,
	`locked` boolean NOT NULL DEFAULT false,
	`last_activity_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `post_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reply` (
	`id` int AUTO_INCREMENT NOT NULL,
	`post_id` int NOT NULL,
	`author_id` varchar(191) NOT NULL,
	`content_md` text NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'published',
	`floor` int NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `reply_id` PRIMARY KEY(`id`),
	CONSTRAINT `reply_post_floor_unique` UNIQUE(`post_id`,`floor`)
);
--> statement-breakpoint
CREATE TABLE `report` (
	`id` int AUTO_INCREMENT NOT NULL,
	`target_type` varchar(32) NOT NULL,
	`target_id` varchar(191) NOT NULL,
	`reporter_id` varchar(191) NOT NULL,
	`reason` text NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`handled_by` varchar(191),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `report_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `server_entry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` varchar(128) NOT NULL,
	`name` varchar(128) NOT NULL,
	`secret` varchar(128) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `server_entry_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_entry_server_id_unique` UNIQUE(`server_id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(191) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`ip_address` varchar(64),
	`user_agent` text,
	`user_id` varchar(191) NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `site_setting` (
	`key` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`updated_by` varchar(191),
	CONSTRAINT `site_setting_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `skin` (
	`id` int AUTO_INCREMENT NOT NULL,
	`player_uuid` varchar(64) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`variant` varchar(32),
	`file_path` text NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`texture_url` text,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`is_active` boolean NOT NULL DEFAULT false,
	`active_slot` varchar(128),
	`uploaded_at` datetime(3) NOT NULL,
	`reviewed_by` varchar(191),
	CONSTRAINT `skin_id` PRIMARY KEY(`id`),
	CONSTRAINT `skin_active_unique_idx` UNIQUE(`player_uuid`,`kind`,`active_slot`),
	CONSTRAINT `skin_player_kind_sha_unique` UNIQUE(`player_uuid`,`kind`,`sha256`)
);
--> statement-breakpoint
CREATE TABLE `title` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`kind` varchar(32) NOT NULL DEFAULT 'special',
	`description` text,
	`color` varchar(16) NOT NULL DEFAULT '#8b5cf6',
	`created_by` varchar(191),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `title_id` PRIMARY KEY(`id`),
	CONSTRAINT `title_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `title_application` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`proposed_name` varchar(64) NOT NULL,
	`reason` text NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`result_title_id` int,
	`reviewed_by` varchar(191),
	`reviewed_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `title_application_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `token` (
	`id` int AUTO_INCREMENT NOT NULL,
	`player_uuid` varchar(64) NOT NULL,
	`access_token_hash` varchar(128) NOT NULL,
	`refresh_token_hash` varchar(128) NOT NULL,
	`client_token_hash` varchar(128),
	`device_name` varchar(128),
	`ip` varchar(64),
	`expires_at` datetime(3) NOT NULL,
	`last_used_at` datetime(3),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `token_id` PRIMARY KEY(`id`),
	CONSTRAINT `token_access_token_hash_unique` UNIQUE(`access_token_hash`),
	CONSTRAINT `token_refresh_token_hash_unique` UNIQUE(`refresh_token_hash`)
);
--> statement-breakpoint
CREATE TABLE `upload_usage` (
	`user_id` varchar(191) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`day` varchar(10) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `upload_usage_user_id_kind_day_pk` PRIMARY KEY(`user_id`,`kind`,`day`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(191) NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`name` varchar(64) NOT NULL,
	`avatar_url` text,
	`role` varchar(32) NOT NULL DEFAULT 'user',
	`banned` boolean NOT NULL DEFAULT false,
	`muted_until` datetime(3),
	`signature` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`),
	CONSTRAINT `user_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `user_permission` (
	`user_id` varchar(191) NOT NULL,
	`permission` varchar(32) NOT NULL,
	`granted_by` varchar(191),
	`granted_at` datetime(3) NOT NULL,
	CONSTRAINT `user_permission_user_id_permission_pk` PRIMARY KEY(`user_id`,`permission`)
);
--> statement-breakpoint
CREATE TABLE `user_progress` (
	`user_id` varchar(191) NOT NULL,
	`xp` int NOT NULL DEFAULT 0,
	`level` int NOT NULL DEFAULT 1,
	`points` int NOT NULL DEFAULT 0,
	`checkin_streak` int NOT NULL DEFAULT 0,
	`last_checkin_on` varchar(10),
	`total_checkins` int NOT NULL DEFAULT 0,
	`xp_boost_until` datetime(3),
	`cape_unlocked_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `user_progress_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `user_title` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`title_id` int NOT NULL,
	`granted_by` varchar(191),
	`granted_at` datetime(3) NOT NULL,
	CONSTRAINT `user_title_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_title_user_title_unique` UNIQUE(`user_id`,`title_id`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(191) NOT NULL,
	`identifier` varchar(191) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3),
	`updated_at` datetime(3),
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vote` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`target_type` varchar(32) NOT NULL,
	`target_id` int NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `vote_id` PRIMARY KEY(`id`),
	CONSTRAINT `vote_user_target_unique_idx` UNIQUE(`user_id`,`target_type`,`target_id`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `banner` ADD CONSTRAINT `banner_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `banner` ADD CONSTRAINT `banner_reviewed_by_user_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category` ADD CONSTRAINT `category_parent_id_category_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `category`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `daily_checkin` ADD CONSTRAINT `daily_checkin_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `game_session` ADD CONSTRAINT `game_session_player_uuid_player_uuid_fk` FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `moderation_log` ADD CONSTRAINT `moderation_log_actor_id_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `nickname_reservation` ADD CONSTRAINT `nickname_reservation_player_uuid_player_uuid_fk` FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification` ADD CONSTRAINT `notification_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification` ADD CONSTRAINT `notification_actor_id_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oauth_code` ADD CONSTRAINT `oauth_code_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player` ADD CONSTRAINT `player_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `point_transaction` ADD CONSTRAINT `point_transaction_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post` ADD CONSTRAINT `post_category_id_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `post` ADD CONSTRAINT `post_author_id_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reply` ADD CONSTRAINT `reply_post_id_post_id_fk` FOREIGN KEY (`post_id`) REFERENCES `post`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reply` ADD CONSTRAINT `reply_author_id_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report` ADD CONSTRAINT `report_reporter_id_user_id_fk` FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report` ADD CONSTRAINT `report_handled_by_user_id_fk` FOREIGN KEY (`handled_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `site_setting` ADD CONSTRAINT `site_setting_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skin` ADD CONSTRAINT `skin_player_uuid_player_uuid_fk` FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skin` ADD CONSTRAINT `skin_reviewed_by_user_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `title` ADD CONSTRAINT `title_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `title_application` ADD CONSTRAINT `title_application_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `title_application` ADD CONSTRAINT `title_application_result_title_id_title_id_fk` FOREIGN KEY (`result_title_id`) REFERENCES `title`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `title_application` ADD CONSTRAINT `title_application_reviewed_by_user_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `token` ADD CONSTRAINT `token_player_uuid_player_uuid_fk` FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `upload_usage` ADD CONSTRAINT `upload_usage_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_permission` ADD CONSTRAINT `user_permission_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_permission` ADD CONSTRAINT `user_permission_granted_by_user_id_fk` FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_progress` ADD CONSTRAINT `user_progress_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_title` ADD CONSTRAINT `user_title_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_title` ADD CONSTRAINT `user_title_title_id_title_id_fk` FOREIGN KEY (`title_id`) REFERENCES `title`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_title` ADD CONSTRAINT `user_title_granted_by_user_id_fk` FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vote` ADD CONSTRAINT `vote_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `banner_status_idx` ON `banner` (`status`);--> statement-breakpoint
CREATE INDEX `banner_user_idx` ON `banner` (`user_id`);--> statement-breakpoint
CREATE INDEX `banner_window_idx` ON `banner` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `captcha_challenge_expires_idx` ON `captcha_challenge` (`expires_at`);--> statement-breakpoint
CREATE INDEX `captcha_challenge_token_used_idx` ON `captcha_challenge` (`token_used_at`);--> statement-breakpoint
CREATE INDEX `daily_checkin_day_idx` ON `daily_checkin` (`checkin_on`);--> statement-breakpoint
CREATE INDEX `game_session_server_id_idx` ON `game_session` (`server_id`);--> statement-breakpoint
CREATE INDEX `game_session_expires_at_idx` ON `game_session` (`expires_at`);--> statement-breakpoint
CREATE INDEX `nickname_reservation_player_uuid_idx` ON `nickname_reservation` (`player_uuid`);--> statement-breakpoint
CREATE INDEX `nickname_reservation_reserved_until_idx` ON `nickname_reservation` (`reserved_until`);--> statement-breakpoint
CREATE INDEX `notification_user_id_idx` ON `notification` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_read_at_idx` ON `notification` (`read_at`);--> statement-breakpoint
CREATE INDEX `notification_user_read_idx` ON `notification` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notification_user_read_created_idx` ON `notification` (`user_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `oauth_code_user_id_idx` ON `oauth_code` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_code_expires_at_idx` ON `oauth_code` (`expires_at`);--> statement-breakpoint
CREATE INDEX `point_transaction_user_idx` ON `point_transaction` (`user_id`);--> statement-breakpoint
CREATE INDEX `point_transaction_created_idx` ON `point_transaction` (`created_at`);--> statement-breakpoint
CREATE INDEX `post_category_id_idx` ON `post` (`category_id`);--> statement-breakpoint
CREATE INDEX `post_author_id_idx` ON `post` (`author_id`);--> statement-breakpoint
CREATE INDEX `post_status_idx` ON `post` (`status`);--> statement-breakpoint
CREATE INDEX `post_status_last_activity_idx` ON `post` (`status`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `post_category_status_activity_idx` ON `post` (`category_id`,`status`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `post_pinned_idx` ON `post` (`pinned`);--> statement-breakpoint
CREATE INDEX `post_last_activity_at_idx` ON `post` (`last_activity_at`);--> statement-breakpoint
CREATE INDEX `reply_post_id_idx` ON `reply` (`post_id`);--> statement-breakpoint
CREATE INDEX `reply_post_status_floor_idx` ON `reply` (`post_id`,`status`,`floor`);--> statement-breakpoint
CREATE INDEX `reply_author_id_idx` ON `reply` (`author_id`);--> statement-breakpoint
CREATE INDEX `report_status_idx` ON `report` (`status`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `skin_player_uuid_idx` ON `skin` (`player_uuid`);--> statement-breakpoint
CREATE INDEX `skin_sha256_idx` ON `skin` (`sha256`);--> statement-breakpoint
CREATE INDEX `skin_status_idx` ON `skin` (`status`);--> statement-breakpoint
CREATE INDEX `skin_is_active_idx` ON `skin` (`is_active`);--> statement-breakpoint
CREATE INDEX `title_application_status_idx` ON `title_application` (`status`);--> statement-breakpoint
CREATE INDEX `title_application_user_idx` ON `title_application` (`user_id`);--> statement-breakpoint
CREATE INDEX `token_player_uuid_idx` ON `token` (`player_uuid`);--> statement-breakpoint
CREATE INDEX `token_expires_at_idx` ON `token` (`expires_at`);--> statement-breakpoint
CREATE INDEX `user_permission_user_idx` ON `user_permission` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_progress_xp_idx` ON `user_progress` (`xp`);--> statement-breakpoint
CREATE INDEX `user_progress_points_idx` ON `user_progress` (`points`);--> statement-breakpoint
CREATE INDEX `user_title_user_idx` ON `user_title` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `vote_target_idx` ON `vote` (`target_type`,`target_id`);