CREATE TABLE `bar` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`min_runs` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bar_project_slug_idx` ON `bar` (`project_id`,`slug`);--> statement-breakpoint
CREATE TABLE `phase` (
	`id` text PRIMARY KEY NOT NULL,
	`bar_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`bar_id`) REFERENCES `bar`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phase_bar_slug_idx` ON `phase` (`bar_id`,`slug`);