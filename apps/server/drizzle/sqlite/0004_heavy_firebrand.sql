PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
INSERT INTO `__new_game_session`("id", "player_uuid", "server_id", "ip", "created_at", "expires_at") SELECT "id", "player_uuid", "server_id", "ip", "created_at", "expires_at" FROM `game_session`;--> statement-breakpoint
DROP TABLE `game_session`;--> statement-breakpoint
ALTER TABLE `__new_game_session` RENAME TO `game_session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `game_session_player_server_unique` ON `game_session` (`player_uuid`,`server_id`);--> statement-breakpoint
CREATE INDEX `game_session_server_id_idx` ON `game_session` (`server_id`);--> statement-breakpoint
CREATE INDEX `game_session_expires_at_idx` ON `game_session` (`expires_at`);