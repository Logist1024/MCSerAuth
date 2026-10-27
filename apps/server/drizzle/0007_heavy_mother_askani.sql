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
CREATE INDEX `user_permission_user_idx` ON `user_permission` (`user_id`);