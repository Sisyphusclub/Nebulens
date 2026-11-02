ALTER TABLE `image_records` ADD `category` text;--> statement-breakpoint
ALTER TABLE `image_records` ADD `category_source` text;--> statement-breakpoint
ALTER TABLE `image_records` ADD `is_shared` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `image_records` ADD `description` text;--> statement-breakpoint
ALTER TABLE `image_records` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `image_records` ADD `text_check` text;--> statement-breakpoint
ALTER TABLE `image_records` ADD `analysis_status` text;--> statement-breakpoint
CREATE INDEX `image_records_shared_created_id_idx` ON `image_records` (`is_shared`,`created_at`,`id`);