CREATE TABLE `oauth_client` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_id` varchar(191) NOT NULL,
	`client_secret_hash` varchar(128),
	`name` varchar(128) NOT NULL,
	`description` text,
	`redirect_uris` json NOT NULL,
	`allowed_scopes` json NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `oauth_client_id` PRIMARY KEY(`id`),
	CONSTRAINT `oauth_client_client_id_unique` UNIQUE(`client_id`)
);
--> statement-breakpoint
CREATE TABLE `oauth_consent` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`client_id` varchar(191) NOT NULL,
	`scope` text NOT NULL,
	`granted_at` datetime(3) NOT NULL,
	CONSTRAINT `oauth_consent_id` PRIMARY KEY(`id`),
	CONSTRAINT `oauth_consent_user_client_unique` UNIQUE(`user_id`,`client_id`)
);
--> statement-breakpoint
ALTER TABLE `token` ADD `client_id` varchar(191);--> statement-breakpoint
ALTER TABLE `token` ADD `scope` text;--> statement-breakpoint
ALTER TABLE `oauth_consent` ADD CONSTRAINT `oauth_consent_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `token_client_id_idx` ON `token` (`client_id`);