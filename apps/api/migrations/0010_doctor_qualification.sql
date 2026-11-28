ALTER TABLE "doctor_profiles" ADD COLUMN "qualification" text;--> statement-breakpoint
-- Seeded demo doctors get a placeholder so their prescriptions are complete.
UPDATE "doctor_profiles" SET "qualification" = 'MBBS (demo)' WHERE "is_demo" = true;
