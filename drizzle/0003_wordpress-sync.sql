CREATE TABLE `feedback_emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wp_meeting_id` integer NOT NULL,
	`agenda_item_id` integer NOT NULL,
	`person_name` text NOT NULL,
	`tm_user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`detail` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_email_item` ON `feedback_emails` (`wp_meeting_id`,`agenda_item_id`);--> statement-breakpoint
CREATE TABLE `wp_meetings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tm_meeting_id` text NOT NULL,
	`wp_meeting_id` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`synced_at` integer NOT NULL,
	`feedback_done_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wp_meetings_tm_meeting_id_unique` ON `wp_meetings` (`tm_meeting_id`);