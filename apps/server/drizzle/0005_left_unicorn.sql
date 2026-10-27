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
CREATE TABLE `upload_usage` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `token` ADD `last_used_at` integer;--> statement-breakpoint
CREATE INDEX `post_status_last_activity_idx` ON `post` (`status`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `post_category_status_activity_idx` ON `post` (`category_id`,`status`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `reply_post_status_floor_idx` ON `reply` (`post_id`,`status`,`floor`);--> statement-breakpoint
CREATE INDEX `vote_target_idx` ON `vote` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `notification_user_read_created_idx` ON `notification` (`user_id`,`read_at`,`created_at`);