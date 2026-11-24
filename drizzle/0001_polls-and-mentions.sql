CREATE TABLE `poll_votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poll_id` integer NOT NULL,
	`member_id` integer NOT NULL,
	`meeting_role_id` integer,
	FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `poll_voter` ON `poll_votes` (`poll_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `polls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wa_message_id` text NOT NULL,
	`meeting_id` integer,
	`secret` text NOT NULL,
	`spec` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `meetings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `polls_wa_message_id_unique` ON `polls` (`wa_message_id`);--> statement-breakpoint
ALTER TABLE `outbox` ADD `mentions` text;--> statement-breakpoint
ALTER TABLE `outbox` ADD `poll` text;