CREATE TYPE "public"."medicine_form" AS ENUM('TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'OINTMENT', 'DROPS', 'INHALER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('ONCE_A_DAY', 'TWICE_A_DAY', 'THREE_TIMES_A_DAY', 'FOUR_TIMES_A_DAY', 'AT_BEDTIME', 'WHEN_NEEDED');--> statement-breakpoint
CREATE TYPE "public"."prescription_status" AS ENUM('DRAFT', 'ISSUED', 'VOIDED');--> statement-breakpoint
CREATE TABLE "medicines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pharmacy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"generic_name" text,
	"form" "medicine_form" NOT NULL,
	"strength" text,
	"pack_size" text,
	"price_paise" integer NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"requires_prescription" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medicine_price_non_negative" CHECK ("medicines"."price_paise" >= 0),
	CONSTRAINT "medicine_stock_non_negative" CHECK ("medicines"."stock_qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pharmacies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prescription_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"medicine_id" uuid,
	"medicine_name" text NOT NULL,
	"dosage" text NOT NULL,
	"frequency" "frequency" NOT NULL,
	"duration_days" integer NOT NULL,
	"quantity" integer NOT NULL,
	"instructions" text,
	CONSTRAINT "item_duration_range" CHECK ("prescription_items"."duration_days" BETWEEN 1 AND 365),
	CONSTRAINT "item_quantity_range" CHECK ("prescription_items"."quantity" BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"status" "prescription_status" DEFAULT 'DRAFT' NOT NULL,
	"general_instructions" text,
	"valid_days" integer DEFAULT 30 NOT NULL,
	"issued_at" timestamp with time zone,
	"valid_until" date,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"supersedes_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescription_valid_days_range" CHECK ("prescriptions"."valid_days" BETWEEN 1 AND 180)
);
--> statement-breakpoint
ALTER TABLE "medicines" ADD CONSTRAINT "medicines_pharmacy_id_pharmacies_id_fk" FOREIGN KEY ("pharmacy_id") REFERENCES "public"."pharmacies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_medicine_id_medicines_id_fk" FOREIGN KEY ("medicine_id") REFERENCES "public"."medicines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_consultation_id_consultations_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_users_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_supersedes_id_prescriptions_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."prescriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medicines_pharmacy_id_index" ON "medicines" USING btree ("pharmacy_id");--> statement-breakpoint
CREATE INDEX "prescription_items_prescription_id_index" ON "prescription_items" USING btree ("prescription_id");--> statement-breakpoint
CREATE INDEX "prescriptions_patient_id_index" ON "prescriptions" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "prescriptions_doctor_id_index" ON "prescriptions" USING btree ("doctor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prescriptions_one_draft" ON "prescriptions" USING btree ("consultation_id") WHERE "prescriptions"."status" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "prescriptions_one_issued" ON "prescriptions" USING btree ("consultation_id") WHERE "prescriptions"."status" = 'ISSUED';--> statement-breakpoint
-- Issued prescriptions are immutable (blueprint §11). The only change allowed after
-- issue is ISSUED -> VOIDED (with voided_at / void_reason). Enforced here so no code
-- path, script or bug can quietly edit a prescription a patient or pharmacy relies on.
CREATE FUNCTION prescriptions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'prescription % is %, it cannot be deleted', OLD.id, OLD.status; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'VOIDED' THEN
    RAISE EXCEPTION 'prescription % is voided and cannot change', OLD.id;
  END IF;
  IF OLD.status = 'ISSUED' AND (
       NEW.status <> 'VOIDED'
    OR NEW.consultation_id IS DISTINCT FROM OLD.consultation_id
    OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
    OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.general_instructions IS DISTINCT FROM OLD.general_instructions
    OR NEW.valid_days IS DISTINCT FROM OLD.valid_days
    OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
    OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
    OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id) THEN
    RAISE EXCEPTION 'prescription % is issued: only voiding is allowed', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER prescriptions_immutable BEFORE UPDATE OR DELETE ON "prescriptions"
  FOR EACH ROW EXECUTE FUNCTION prescriptions_guard();--> statement-breakpoint
CREATE FUNCTION prescription_items_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status prescription_status;
BEGIN
  SELECT status INTO parent_status FROM prescriptions
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.prescription_id ELSE NEW.prescription_id END;
  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'items of a % prescription cannot change', parent_status;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint
CREATE TRIGGER prescription_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON "prescription_items"
  FOR EACH ROW EXECUTE FUNCTION prescription_items_guard();
