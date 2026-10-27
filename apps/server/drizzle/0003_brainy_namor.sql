ALTER TABLE `post` ADD `locked` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `notification` ADD `message` text;--> statement-breakpoint
CREATE INDEX `notification_user_read_idx` ON `notification` (`user_id`,`read_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `reply_post_floor_unique` ON `reply` (`post_id`,`floor`);