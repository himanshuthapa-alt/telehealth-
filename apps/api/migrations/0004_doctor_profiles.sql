CREATE TYPE "public"."specialization" AS ENUM('General Physician', 'Pediatrics', 'Gynecology', 'Dermatology', 'Orthopedics', 'ENT', 'Cardiology', 'Psychiatry');--> statement-breakpoint
CREATE TABLE "doctor_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"specializations" "specialization"[] NOT NULL,
	"languages" "language"[] NOT NULL,
	"experience_years" integer NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"fee_inr" integer NOT NULL,
	"rating_avg" numeric(2, 1),
	"rating_count" integer DEFAULT 0 NOT NULL,
	"photo_url" text,
	"registration_number" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_has_specialization" CHECK (cardinality("doctor_profiles"."specializations") >= 1),
	CONSTRAINT "doctor_has_language" CHECK (cardinality("doctor_profiles"."languages") >= 1),
	CONSTRAINT "doctor_experience_range" CHECK ("doctor_profiles"."experience_years" BETWEEN 0 AND 70),
	CONSTRAINT "doctor_fee_non_negative" CHECK ("doctor_profiles"."fee_inr" >= 0),
	CONSTRAINT "doctor_rating_range" CHECK ("doctor_profiles"."rating_avg" BETWEEN 0 AND 5)
);
--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;