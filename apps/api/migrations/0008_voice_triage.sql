CREATE TYPE "public"."doctor_source" AS ENUM('OWN', 'PARTNER');--> statement-breakpoint
CREATE TYPE "public"."speech_language" AS ENUM('hi', 'hi-en', 'en', 'gbm');--> statement-breakpoint
CREATE TYPE "public"."voice_channel" AS ENUM('APP', 'IVR');--> statement-breakpoint
CREATE TYPE "public"."voice_outcome" AS ENUM('ROUTINE_BOOKED', 'URGENT_PAGED', 'EMERGENCY_ADVISED', 'ABANDONED', 'OFFLINE_QUEUED');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('EMERGENCY', 'URGENT', 'ROUTINE');--> statement-breakpoint
CREATE TYPE "public"."dispatch_channel" AS ENUM('CALL', 'SMS', 'APP');--> statement-breakpoint
CREATE TYPE "public"."dispatch_status" AS ENUM('SENT', 'ACCEPTED', 'DECLINED', 'TIMEOUT', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."language" ADD VALUE 'Garhwali';--> statement-breakpoint
CREATE TABLE "voice_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"language" "speech_language" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"file_url" text NOT NULL,
	"duration_ms" integer,
	"recorded_by" text,
	"checksum" text,
	CONSTRAINT "voice_prompts_key_lang_version" UNIQUE("key","language","version")
);
--> statement-breakpoint
CREATE TABLE "voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"channel" "voice_channel" DEFAULT 'APP' NOT NULL,
	"caller_phone_hash" text,
	"language_prior" "speech_language",
	"outcome" "voice_outcome",
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "voice_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"client_turn_id" text NOT NULL,
	"direction" text DEFAULT 'IN' NOT NULL,
	"transcript" text DEFAULT '' NOT NULL,
	"stt_provider" text,
	"stt_language" text,
	"detected_language" "speech_language",
	"language_confidence" numeric(3, 2),
	"tts_provider" text,
	"latency_ms" jsonb,
	"audio_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_turns_session_client_turn" UNIQUE("session_id","client_turn_id")
);
--> statement-breakpoint
CREATE TABLE "symptom_tag_specialty" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_code" text NOT NULL,
	"specialization" "specialization" NOT NULL,
	"weight" numeric(3, 2) DEFAULT 1 NOT NULL,
	"age_band" text,
	CONSTRAINT "symptom_tag_specialty_pair" UNIQUE("tag_code","specialization","age_band")
);
--> statement-breakpoint
CREATE TABLE "symptom_tags" (
	"code" text PRIMARY KEY NOT NULL,
	"label_en" text NOT NULL,
	"label_hi" text NOT NULL,
	"label_gbm" text,
	"is_red_flag" boolean DEFAULT false NOT NULL,
	"default_urgency" "urgency" DEFAULT 'ROUTINE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "triage_result_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triage_result_id" uuid NOT NULL,
	"tag_code" text NOT NULL,
	"confidence" numeric(3, 2)
);
--> statement-breakpoint
CREATE TABLE "triage_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"urgency" "urgency" NOT NULL,
	"emergency_reason" text,
	"specialization" "specialization",
	"summary_for_doctor" text,
	"model" text,
	"prompt_version" text,
	"rule_hits" text[] DEFAULT '{}' NOT NULL,
	"patient_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "callback_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"virtual_number" text,
	"provider_pair_id" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"last_call_duration_s" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triage_result_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"channel" "dispatch_channel" DEFAULT 'APP' NOT NULL,
	"status" "dispatch_status" DEFAULT 'SENT' NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD COLUMN "on_call" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD COLUMN "source" "doctor_source" DEFAULT 'OWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD COLUMN "partner_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD COLUMN "max_urgent_per_hour" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_turns" ADD CONSTRAINT "voice_turns_session_id_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_tag_specialty" ADD CONSTRAINT "symptom_tag_specialty_tag_code_symptom_tags_code_fk" FOREIGN KEY ("tag_code") REFERENCES "public"."symptom_tags"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_result_tags" ADD CONSTRAINT "triage_result_tags_triage_result_id_triage_results_id_fk" FOREIGN KEY ("triage_result_id") REFERENCES "public"."triage_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_results" ADD CONSTRAINT "triage_results_turn_id_voice_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."voice_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callback_sessions" ADD CONSTRAINT "callback_sessions_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ADD CONSTRAINT "dispatch_attempts_triage_result_id_triage_results_id_fk" FOREIGN KEY ("triage_result_id") REFERENCES "public"."triage_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_attempts" ADD CONSTRAINT "dispatch_attempts_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "triage_result_tags_triage_result_id_index" ON "triage_result_tags" USING btree ("triage_result_id");--> statement-breakpoint
CREATE INDEX "dispatch_attempts_triage_result_id_index" ON "dispatch_attempts" USING btree ("triage_result_id");