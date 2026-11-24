ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_endpoint_unique";--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP CONSTRAINT "push_subscriptions_endpoint_check";--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "endpoint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "p256dh" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ALTER COLUMN "auth" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "kind" text DEFAULT 'webpush' NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD COLUMN "platform" text;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_user_endpoint_key" ON "push_subscriptions" USING btree ("user_id","endpoint") WHERE "push_subscriptions"."kind" = 'webpush';--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions" USING btree ("endpoint") WHERE "push_subscriptions"."kind" = 'webpush';--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_user_token_key" ON "push_subscriptions" USING btree ("user_id","kind","token") WHERE "push_subscriptions"."kind" in ('apns', 'fcm');--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_kind_check" CHECK ("push_subscriptions"."kind" in ('webpush', 'apns', 'fcm'));--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_shape_check" CHECK ((
        "push_subscriptions"."kind" = 'webpush'
        and "push_subscriptions"."endpoint" is not null
        and "push_subscriptions"."p256dh" is not null
        and "push_subscriptions"."auth" is not null
        and "push_subscriptions"."token" is null
      ) or (
        "push_subscriptions"."kind" in ('apns', 'fcm')
        and "push_subscriptions"."token" is not null
        and char_length("push_subscriptions"."token") between 16 and 512
        and "push_subscriptions"."endpoint" is null
        and "push_subscriptions"."p256dh" is null
        and "push_subscriptions"."auth" is null
        and ("push_subscriptions"."platform" is null or "push_subscriptions"."platform" in ('ios', 'android'))
      ));--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_endpoint_check" CHECK ("push_subscriptions"."endpoint" is null or ("push_subscriptions"."endpoint" like 'https://%' and char_length("push_subscriptions"."endpoint") <= 2048));