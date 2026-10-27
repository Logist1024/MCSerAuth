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
CREATE INDEX `oauth_code_expires_at_idx` ON `oauth_code` (`expires_at`);