CREATE TYPE "public"."appointment_party" AS ENUM('PATIENT', 'DOCTOR');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('BOOKED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');--> statement-breakpoint
CREATE TABLE "availability_exceptions" (
	"doctor_id" uuid NOT NULL,
	"date" date NOT NULL,
	"reason" text,
	CONSTRAINT "availability_exceptions_doctor_id_date_pk" PRIMARY KEY("doctor_id","date")
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doctor_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"slot_minutes" smallint NOT NULL,
	CONSTRAINT "rule_weekday_range" CHECK ("availability_rules"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "rule_start_before_end" CHECK ("availability_rules"."start_time" < "availability_rules"."end_time"),
	CONSTRAINT "rule_slot_minutes_range" CHECK ("availability_rules"."slot_minutes" BETWEEN 5 AND 120)
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'BOOKED' NOT NULL,
	"reason_note" text,
	"idempotency_key" uuid NOT NULL,
	"cancelled_by" "appointment_party",
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_patient_idempotency_key" UNIQUE("patient_id","idempotency_key"),
	CONSTRAINT "appointment_end_after_start" CHECK ("appointments"."end_at" > "appointments"."start_at")
);
--> statement-breakpoint
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_rules_doctor_id_index" ON "availability_rules" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "appointments_doctor_id_start_at_index" ON "appointments" USING btree ("doctor_id","start_at");--> statement-breakpoint
CREATE INDEX "appointments_patient_id_start_at_index" ON "appointments" USING btree ("patient_id","start_at");--> statement-breakpoint
-- No overlapping active appointments, per doctor and per patient. Enforced by the
-- database, so concurrent booking requests can't both succeed (blueprint §11, §23).
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_no_overlap"
  EXCLUDE USING gist ("doctor_id" WITH =, tstzrange("start_at", "end_at") WITH &&) WHERE ("status" = 'BOOKED');--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_no_overlap"
  EXCLUDE USING gist ("patient_id" WITH =, tstzrange("start_at", "end_at") WITH &&) WHERE ("status" = 'BOOKED');
