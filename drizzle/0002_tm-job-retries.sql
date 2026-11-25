ALTER TABLE `tm_jobs` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tm_jobs` ADD `next_attempt_at` integer;