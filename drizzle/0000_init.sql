CREATE TABLE `activities` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`application_id` char(36),
	`type` enum('created','status','email','interview','test','followup','offer','note','document') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`date` datetime NOT NULL,
	CONSTRAINT `activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `application_documents` (
	`application_id` char(36) NOT NULL,
	`document_id` char(36) NOT NULL,
	CONSTRAINT `application_documents_application_id_document_id_pk` PRIMARY KEY(`application_id`,`document_id`)
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`company` varchar(255) NOT NULL,
	`position` varchar(255) NOT NULL,
	`department` varchar(255) NOT NULL DEFAULT '',
	`location` varchar(255) NOT NULL DEFAULT '',
	`work_type` enum('Remote','Hybrid','WFO') NOT NULL DEFAULT 'WFO',
	`job_type` enum('Full Time','Part Time','Internship','Contract') NOT NULL DEFAULT 'Full Time',
	`salary_min` int,
	`salary_max` int,
	`source` varchar(64) NOT NULL DEFAULT '',
	`url` varchar(1024) NOT NULL DEFAULT '',
	`applied_date` date,
	`deadline` date,
	`recruiter_name` varchar(255) NOT NULL DEFAULT '',
	`recruiter_email` varchar(255) NOT NULL DEFAULT '',
	`recruiter_phone` varchar(32) NOT NULL DEFAULT '',
	`notes` text NOT NULL,
	`status` enum('wishlist','applied','screening','hr_interview','user_interview','technical_test','offer','accepted','rejected','ghosted','withdrawn') NOT NULL DEFAULT 'wishlist',
	`tags` json NOT NULL,
	`archived` boolean NOT NULL DEFAULT false,
	`favorite` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`company` varchar(255) NOT NULL,
	`position` varchar(255) NOT NULL,
	`url` varchar(1024) NOT NULL DEFAULT '',
	`source` varchar(64) NOT NULL DEFAULT '',
	`deadline` date,
	`note` text NOT NULL,
	`favorite` boolean NOT NULL DEFAULT false,
	`saved_at` datetime NOT NULL,
	CONSTRAINT `bookmarks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`object_key` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`label` varchar(255) NOT NULL,
	`group` varchar(255) NOT NULL,
	`category` enum('cv','cover_letter','portfolio','certificate','diploma','transcript','other') NOT NULL,
	`language` enum('id','en','-') NOT NULL DEFAULT '-',
	`version` varchar(32) NOT NULL DEFAULT 'v1',
	`size` int NOT NULL,
	`mime` varchar(128) NOT NULL,
	`note` text NOT NULL,
	`state` enum('pending','ready') NOT NULL DEFAULT 'pending',
	`uploaded_at` datetime NOT NULL,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `interview_notes` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`application_id` char(36) NOT NULL,
	`stage` varchar(64) NOT NULL,
	`date` date,
	`qa` json NOT NULL,
	`feedback` text NOT NULL,
	`strengths` text NOT NULL,
	`weaknesses` text NOT NULL,
	`to_learn` text NOT NULL,
	CONSTRAINT `interview_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`application_id` char(36),
	`type` enum('interview','technical_test','followup','deadline','cv_validity') NOT NULL,
	`title` varchar(255) NOT NULL,
	`datetime` datetime NOT NULL,
	`notes` text NOT NULL,
	`done` boolean NOT NULL DEFAULT false,
	`auto_key` varchar(128),
	`sent_at` datetime,
	CONSTRAINT `reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_auto` UNIQUE(`user_id`,`auto_key`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` char(36) NOT NULL,
	`theme` enum('light','dark') NOT NULL DEFAULT 'light',
	`language` enum('id','en') NOT NULL DEFAULT 'id',
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Jakarta',
	`weekly_target` smallint NOT NULL DEFAULT 5,
	`monthly_target` smallint NOT NULL DEFAULT 20,
	`email_notif` boolean NOT NULL DEFAULT true,
	`daily_reminder` boolean NOT NULL DEFAULT true,
	`notify_email` varchar(255) NOT NULL,
	`cv_valid_days` smallint NOT NULL DEFAULT 90,
	CONSTRAINT `settings_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `status_history` (
	`id` char(36) NOT NULL,
	`application_id` char(36) NOT NULL,
	`status` enum('wishlist','applied','screening','hr_interview','user_interview','technical_test','offer','accepted','rejected','ghosted','withdrawn') NOT NULL,
	`at` datetime NOT NULL,
	CONSTRAINT `status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`user_id` char(36) NOT NULL,
	`name` varchar(64) NOT NULL,
	`color` char(7) NOT NULL,
	CONSTRAINT `tags_user_id_name_pk` PRIMARY KEY(`user_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`google_sub` varchar(64) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`avatar_url` varchar(512),
	`created_at` datetime NOT NULL,
	`last_seen_at` datetime NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_google_sub_unique` UNIQUE(`google_sub`)
);
--> statement-breakpoint
CREATE TABLE `wishes` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`company` varchar(255) NOT NULL,
	`role` varchar(255) NOT NULL DEFAULT '',
	`prep` enum('not_started','research','preparing','ready') NOT NULL DEFAULT 'not_started',
	`skills` json NOT NULL,
	`deadline` date,
	`notes` text NOT NULL,
	CONSTRAINT `wishes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activities` ADD CONSTRAINT `activities_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `application_documents` ADD CONSTRAINT `application_documents_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `application_documents` ADD CONSTRAINT `application_documents_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `applications` ADD CONSTRAINT `applications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD CONSTRAINT `bookmarks_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `interview_notes` ADD CONSTRAINT `interview_notes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `interview_notes` ADD CONSTRAINT `interview_notes_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reminders` ADD CONSTRAINT `reminders_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reminders` ADD CONSTRAINT `reminders_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `settings` ADD CONSTRAINT `settings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `status_history` ADD CONSTRAINT `status_history_application_id_applications_id_fk` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tags` ADD CONSTRAINT `tags_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wishes` ADD CONSTRAINT `wishes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_user_date` ON `activities` (`user_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_user_status` ON `applications` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_user_deadline` ON `applications` (`user_id`,`deadline`);--> statement-breakpoint
CREATE INDEX `idx_user_created` ON `applications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_user` ON `bookmarks` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_state` ON `documents` (`user_id`,`state`);--> statement-breakpoint
CREATE INDEX `idx_user` ON `interview_notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_due` ON `reminders` (`datetime`,`done`,`sent_at`);--> statement-breakpoint
CREATE INDEX `idx_app` ON `status_history` (`application_id`,`at`);--> statement-breakpoint
CREATE INDEX `idx_last_seen` ON `users` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `idx_user` ON `wishes` (`user_id`);