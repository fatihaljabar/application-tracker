ALTER TABLE `applications` ADD `followup_dismissed` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `last_digest_on` date;