CREATE TYPE "public"."consultation_event_type" AS ENUM('JOINED', 'LEFT', 'RECONNECTED', 'VIDEO_FAILED');--> statement-breakpoint
CREATE TYPE "public"."consultation_status" AS ENUM('WAITING', 'ACTIVE', 'COMPLETED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('TEXT', 'SYSTEM', 'PRESCRIPTION_CARD');--> statement-breakpoint
CREATE TABLE "consultation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "consultation_event_type" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"status" "consultation_status" DEFAULT 'WAITING' NOT NULL,
	"provider" text NOT NULL,
	"provider_room_id" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultations_appointmentId_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"consultation_id" uuid NOT NULL,
	"sender_id" uuid,
	"client_msg_id" uuid,
	"type" "message_type" DEFAULT 'TEXT' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_sender_client_msg_id" UNIQUE("sender_id","client_msg_id")
);
--> statement-breakpoint
ALTER TABLE "consultation_events" ADD CONSTRAINT "consultation_events_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_events" ADD CONSTRAINT "consultation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultation_events_consultation_id_index" ON "consultation_events" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "messages_consultation_id_id_index" ON "messages" USING btree ("consultation_id","id");