CREATE TYPE "public"."doctor_verification" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'ADMIN';--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD COLUMN "verification_status" "doctor_verification" DEFAULT 'APPROVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD COLUMN "verification_note" text;
