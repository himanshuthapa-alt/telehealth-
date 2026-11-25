ALTER TYPE "public"."language" ADD VALUE 'Garhwali';--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD COLUMN "is_on_call" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TYPE "public"."urgent_request_status" AS ENUM('PENDING', 'ACCEPTED', 'EXHAUSTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "urgent_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"symptoms" text NOT NULL,
	"recommended_specialization" "specialization" NOT NULL,
	"language" "language",
	"candidate_doctor_ids" uuid[] NOT NULL,
	"candidate_index" integer DEFAULT 0 NOT NULL,
	"idempotency_key" uuid,
	"assigned_doctor_id" uuid,
	"status" "urgent_request_status" DEFAULT 'PENDING' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "urgent_requests_has_candidates" CHECK (cardinality("candidate_doctor_ids") >= 1),
	CONSTRAINT "urgent_requests_candidate_index_range" CHECK ("candidate_index" >= 0)
);--> statement-breakpoint
ALTER TABLE "urgent_requests" ADD CONSTRAINT "urgent_requests_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "urgent_requests" ADD CONSTRAINT "urgent_requests_assigned_doctor_id_users_id_fk" FOREIGN KEY ("assigned_doctor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "urgent_requests_patient_created" ON "urgent_requests" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "urgent_requests_assignee_status" ON "urgent_requests" USING btree ("assigned_doctor_id","status","assigned_at");--> statement-breakpoint
CREATE INDEX "urgent_requests_status_assigned" ON "urgent_requests" USING btree ("status","assigned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "urgent_requests_patient_idempotency" ON "urgent_requests" USING btree ("patient_id","idempotency_key") WHERE "idempotency_key" IS NOT NULL;
