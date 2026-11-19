CREATE TYPE "public"."ai_status" AS ENUM('pending', 'done', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."donor_condition" AS ENUM('working', 'unsure', 'not_working');--> statement-breakpoint
CREATE TYPE "public"."inspection_decision" AS ENUM('accepted', 'rejected', 'unsafe');--> statement-breakpoint
CREATE TYPE "public"."inspection_fit" AS ENUM('fits', 'does_not_fit', 'uncertain');--> statement-breakpoint
CREATE TYPE "public"."inspection_status" AS ENUM('not_inspected', 'checked', 'rejected', 'blocked_unsafe');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('active', 'withdrawn', 'removed', 'closed');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('reserved', 'accepted', 'rejected', 'blocked_unsafe', 'completed', 'declined', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."part_availability" AS ENUM('available', 'reserved', 'handed_over', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('open', 'reserved', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('community', 'technician', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TABLE "areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"town" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "areas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "compatibility_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"donor_model_id" integer NOT NULL,
	"recipient_model_id" integer NOT NULL,
	"part_type_id" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"source" text NOT NULL,
	"notes" text,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"donor_id" integer NOT NULL,
	"model_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"visible_condition" text NOT NULL,
	"description" text,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"removed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"model_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"match_id" integer NOT NULL,
	"technician_id" integer NOT NULL,
	"inspected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"observed_condition" text NOT NULL,
	"fit" "inspection_fit" NOT NULL,
	"decision" "inspection_decision" NOT NULL,
	"notes" text,
	CONSTRAINT "inspections_match_id_unique" UNIQUE("match_id")
);
--> statement-breakpoint
CREATE TABLE "listing_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"part_type_id" integer NOT NULL,
	"donor_condition" "donor_condition" DEFAULT 'unsure' NOT NULL,
	"donor_notes" text,
	"inspection_status" "inspection_status" DEFAULT 'not_inspected' NOT NULL,
	"availability" "part_availability" DEFAULT 'available' NOT NULL,
	"checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "listing_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"ai_status" "ai_status" DEFAULT 'pending' NOT NULL,
	"ai_model_label" text,
	"ai_model_confidence" real,
	"ai_damage_label" text,
	"ai_damage_confidence" real,
	"ai_low_confidence" boolean,
	"ai_engine" text,
	"ai_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_photos_file_name_unique" UNIQUE("file_name")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_part_id" integer NOT NULL,
	"request_id" integer NOT NULL,
	"rule_id" integer NOT NULL,
	"status" "match_status" DEFAULT 'reserved' NOT NULL,
	"reason" text NOT NULL,
	"distance_km" real,
	"inspection_status_at_match" "inspection_status" NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_id" integer,
	"outcome_note" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_id" integer NOT NULL,
	"model_id" integer NOT NULL,
	"part_type_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"problem" text NOT NULL,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "part_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_battery" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "part_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'community' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"area_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "compatibility_rules" ADD CONSTRAINT "compatibility_rules_donor_model_id_device_models_id_fk" FOREIGN KEY ("donor_model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_rules" ADD CONSTRAINT "compatibility_rules_recipient_model_id_device_models_id_fk" FOREIGN KEY ("recipient_model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_rules" ADD CONSTRAINT "compatibility_rules_part_type_id_part_types_id_fk" FOREIGN KEY ("part_type_id") REFERENCES "public"."part_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compatibility_rules" ADD CONSTRAINT "compatibility_rules_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_listings" ADD CONSTRAINT "device_listings_donor_id_users_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_listings" ADD CONSTRAINT "device_listings_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_listings" ADD CONSTRAINT "device_listings_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_parts" ADD CONSTRAINT "listing_parts_listing_id_device_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."device_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_parts" ADD CONSTRAINT "listing_parts_part_type_id_part_types_id_fk" FOREIGN KEY ("part_type_id") REFERENCES "public"."part_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_device_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."device_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_listing_part_id_listing_parts_id_fk" FOREIGN KEY ("listing_part_id") REFERENCES "public"."listing_parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_request_id_part_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."part_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_rule_id_compatibility_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."compatibility_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_model_id_device_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."device_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_part_type_id_part_types_id_fk" FOREIGN KEY ("part_type_id") REFERENCES "public"."part_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_requests" ADD CONSTRAINT "part_requests_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compat_rule_uq" ON "compatibility_rules" USING btree ("donor_model_id","recipient_model_id","part_type_id");--> statement-breakpoint
CREATE INDEX "listings_donor_idx" ON "device_listings" USING btree ("donor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_models_brand_model_uq" ON "device_models" USING btree ("brand","model_name");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_part_type_uq" ON "listing_parts" USING btree ("listing_id","part_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_match_per_part" ON "matches" USING btree ("listing_part_id") WHERE "matches"."status" in ('reserved', 'accepted');--> statement-breakpoint
CREATE UNIQUE INDEX "one_open_match_per_request" ON "matches" USING btree ("request_id") WHERE "matches"."status" in ('reserved', 'accepted');--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "requests_recipient_idx" ON "part_requests" USING btree ("recipient_id");