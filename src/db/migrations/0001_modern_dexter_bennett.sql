CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `api_keys` ADD `provider_whitelist` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `models` ADD `cost_input_per_1k` real;--> statement-breakpoint
ALTER TABLE `models` ADD `cost_output_per_1k` real;