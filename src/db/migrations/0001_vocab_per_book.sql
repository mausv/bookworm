CREATE TABLE `__new_vocab_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`highlight_id` text,
	`book_id` text NOT NULL,
	`term` text NOT NULL,
	`term_key` text NOT NULL,
	`definition` text,
	`part_of_speech` text,
	`language` text,
	`example` text,
	`status` text DEFAULT 'new' NOT NULL,
	`definition_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `book`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_vocab_entry`("id", "highlight_id", "book_id", "term", "term_key", "definition", "part_of_speech", "language", "example", "status", "definition_by", "created_at", "updated_at") SELECT v."id", v."highlight_id", h."book_id", v."term", lower(trim(v."term")), v."definition", v."part_of_speech", v."language", v."example", v."status", v."definition_by", v."created_at", v."updated_at" FROM `vocab_entry` v JOIN `highlight` h ON h."id" = v."highlight_id";--> statement-breakpoint
DROP TABLE `vocab_entry`;--> statement-breakpoint
ALTER TABLE `__new_vocab_entry` RENAME TO `vocab_entry`;--> statement-breakpoint
ALTER TABLE `highlight` ADD `vocab_id` text REFERENCES vocab_entry(id) ON DELETE set null;--> statement-breakpoint
UPDATE `highlight` SET `vocab_id` = (SELECT v."id" FROM `vocab_entry` v WHERE v."highlight_id" = `highlight`."id");--> statement-breakpoint
CREATE TEMP TABLE `vocab_keep` AS SELECT v."id" AS "id", (SELECT k."id" FROM `vocab_entry` k WHERE k."book_id" = v."book_id" AND k."term_key" = v."term_key" ORDER BY (k."definition" IS NULL OR k."definition" = ''), k."created_at", k."id" LIMIT 1) AS "keep_id" FROM `vocab_entry` v;--> statement-breakpoint
UPDATE `highlight` SET `vocab_id` = (SELECT "keep_id" FROM `vocab_keep` WHERE `vocab_keep`."id" = `highlight`."vocab_id") WHERE `vocab_id` IS NOT NULL;--> statement-breakpoint
UPDATE `quiz_attempt` SET `vocab_id` = (SELECT "keep_id" FROM `vocab_keep` WHERE `vocab_keep`."id" = `quiz_attempt`."vocab_id");--> statement-breakpoint
DELETE FROM `vocab_entry` WHERE "id" IN (SELECT "id" FROM `vocab_keep` WHERE "id" != "keep_id");--> statement-breakpoint
DROP TABLE `vocab_keep`;--> statement-breakpoint
CREATE UNIQUE INDEX `vocab_entry_book_term_uidx` ON `vocab_entry` (`book_id`,`term_key`);--> statement-breakpoint
CREATE INDEX `highlight_vocab_idx` ON `highlight` (`vocab_id`);
