CREATE INDEX `notification_user_created_idx` ON `notification` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `report_reporter_target_status_idx` ON `report` (`reporter_id`,`target_type`,`target_id`,`status`);--> statement-breakpoint
CREATE INDEX `session_expires_at_idx` ON `session` (`expires_at`);--> statement-breakpoint
CREATE INDEX `verification_expires_at_idx` ON `verification` (`expires_at`);