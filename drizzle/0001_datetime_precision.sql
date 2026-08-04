ALTER TABLE `activities` MODIFY COLUMN `date` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `applications` MODIFY COLUMN `created_at` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `applications` MODIFY COLUMN `updated_at` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmarks` MODIFY COLUMN `saved_at` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `uploaded_at` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `reminders` MODIFY COLUMN `datetime` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `reminders` MODIFY COLUMN `sent_at` datetime(3);--> statement-breakpoint
ALTER TABLE `status_history` MODIFY COLUMN `at` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `created_at` datetime(3) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `last_seen_at` datetime(3) NOT NULL;