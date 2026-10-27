CREATE TABLE `game_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_uuid` text NOT NULL,
	`server_id` text NOT NULL,
	`ip` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`player_uuid`) REFERENCES `player`(`uuid`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `server_entry`(`server_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_session_player_server_unique` ON `game_session` (`player_uuid`,`server_id`);--> statement-breakpoint
CREATE INDEX `game_session_server_id_idx` ON `game_session` (`server_id`);--> statement-breakpoint
CREATE INDEX `game_session_expires_at_idx` ON `game_session` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `skin_player_kind_sha_unique` ON `skin` (`player_uuid`,`kind`,`sha256`);