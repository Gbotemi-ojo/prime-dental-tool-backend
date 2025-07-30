CREATE TABLE `daily_visits` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`patient_id` int NOT NULL,
	`check_in_time` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `daily_visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dental_records` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`patient_id` int NOT NULL,
	`doctor_id` int,
	`complaint` text,
	`history_of_present_complaint` text,
	`past_dental_history` text,
	`medication_s` boolean DEFAULT false,
	`medication_h` boolean DEFAULT false,
	`medication_a` boolean DEFAULT false,
	`medication_d` boolean DEFAULT false,
	`medication_e` boolean DEFAULT false,
	`medication_pud` boolean DEFAULT false,
	`medication_blood_disorder` boolean DEFAULT false,
	`medication_allergy` boolean DEFAULT false,
	`medication_hiv` boolean DEFAULT false,
	`medication_hepatitis` boolean DEFAULT false,
	`family_social_history` text,
	`extra_oral_examination` text,
	`intra_oral_examination` text,
	`teeth_present` json,
	`carious_cavity` json,
	`filled_teeth` json,
	`missing_teeth` json,
	`fractured_teeth` json,
	`periodontal_condition` varchar(100),
	`oral_hygiene` varchar(50),
	`investigations` text,
	`x_ray_findings` text,
	`xray_url` varchar(512),
	`provisional_diagnosis` json,
	`treatment_plan` json,
	`treatment_done` text,
	`calculus` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dental_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(100) NOT NULL,
	`unit_price` decimal(10,2) NOT NULL,
	`description` text,
	`unit_of_measure` varchar(50) NOT NULL,
	`reorder_level` int NOT NULL DEFAULT 0,
	`current_stock` int NOT NULL DEFAULT 0,
	`cost_per_unit` decimal(10,2) DEFAULT '0.00',
	`supplier` varchar(255),
	`last_restocked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_items_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `inventory_transactions` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`user_id` int,
	`transaction_type` varchar(50) NOT NULL,
	`quantity` int NOT NULL,
	`notes` text,
	`transaction_date` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`family_id` int,
	`is_family_head` boolean NOT NULL DEFAULT false,
	`name` varchar(255) NOT NULL,
	`sex` varchar(50) NOT NULL,
	`date_of_birth` timestamp,
	`phone_number` varchar(20),
	`email` varchar(255),
	`address` text,
	`hmo` json,
	`next_appointment_date` timestamp,
	`outstanding` decimal(10,2) NOT NULL DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_phone_number_unique` UNIQUE(`phone_number`),
	CONSTRAINT `patients_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`username` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`email` varchar(255),
	`role` varchar(50) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `daily_visits` ADD CONSTRAINT `daily_visits_patient_id_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dental_records` ADD CONSTRAINT `dental_records_patient_id_patients_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dental_records` ADD CONSTRAINT `dental_records_doctor_id_users_id_fk` FOREIGN KEY (`doctor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_item_id_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `patients` ADD CONSTRAINT `patients_family_id_patients_id_fk` FOREIGN KEY (`family_id`) REFERENCES `patients`(`id`) ON DELETE set null ON UPDATE no action;