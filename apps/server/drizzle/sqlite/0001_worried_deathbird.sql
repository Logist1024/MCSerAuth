CREATE TABLE `oauth_client` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`client_secret_hash` text,
	`name` text NOT NULL,
	`description` text,
	`redirect_uris` text NOT NULL,
	`allowed_scopes` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_client_client_id_unique` ON `oauth_client` (`client_id`);--> statement-breakpoint
CREATE TABLE `oauth_consent` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`scope` text NOT NULL,
	`granted_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_consent_user_client_unique` ON `oauth_consent` (`user_id`,`client_id`);--> statement-breakpoint
ALTER TABLE `token` ADD `client_id` text;--> statement-breakpoint
ALTER TABLE `token` ADD `scope` text;--> statement-breakpoint
CREATE INDEX `token_client_id_idx` ON `token` (`client_id`);