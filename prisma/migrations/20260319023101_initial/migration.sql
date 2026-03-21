-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "target_language" TEXT,
    "native_language" TEXT,
    "program_track" TEXT NOT NULL DEFAULT 'conversation_fluency',
    "session_length_minutes" INTEGER NOT NULL DEFAULT 30,
    "sessions_per_week" INTEGER NOT NULL DEFAULT 2,
    "onboarding_complete" BOOLEAN NOT NULL DEFAULT false,
    "correction_style" TEXT NOT NULL DEFAULT 'recast',
    "lesson_style_preference" TEXT NOT NULL DEFAULT 'conversational',
    "struggle_patience_seconds" INTEGER NOT NULL DEFAULT 6,
    "topic_focus_preference" TEXT NOT NULL DEFAULT 'focused',
    "native_language_support" BOOLEAN NOT NULL DEFAULT true,
    "personal_notes" TEXT NOT NULL DEFAULT '',
    "total_lessons" INTEGER NOT NULL DEFAULT 0,
    "total_minutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cefr_grammar" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "cefr_fluency" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "avg_response_latency_sec" DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "sessions_completed" INTEGER NOT NULL DEFAULT 0,
    "speech_profile" TEXT,
    "priority_focus" TEXT,
    "error_density_trend" TEXT,
    "error_density_per_100_words" DOUBLE PRECISION,
    "domains_visited" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "learner_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_patterns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "learner_model_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "sessions_seen" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "error_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "learner_model_id" UUID NOT NULL,
    "word" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'new',
    "seen_count" INTEGER NOT NULL DEFAULT 0,
    "spontaneous_uses" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "vocabulary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "target_language" TEXT NOT NULL,
    "lesson_goal" TEXT,
    "phases_completed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topics_covered" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vocab_introduced" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "errors_count" INTEGER NOT NULL DEFAULT 0,
    "difficulty_final" INTEGER,
    "transcript_path" TEXT,
    "summary" TEXT,
    "corrections_doc" TEXT,
    "lesson_plan" JSONB,
    "system_prompt" TEXT,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "lesson_id" UUID NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_type" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "correction" TEXT NOT NULL,
    "rule" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_vocab" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "language" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "cefr_level" TEXT NOT NULL,
    "frequency_rank" INTEGER NOT NULL,
    "domain" TEXT,

    CONSTRAINT "curriculum_vocab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_grammar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "language" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "cefr_level" TEXT NOT NULL,
    "sequence_position" INTEGER NOT NULL,
    "prerequisites" TEXT[],

    CONSTRAINT "curriculum_grammar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "stripe_price_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_usage" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "conversation_seconds" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learner_models_user_id_key" ON "learner_models"("user_id");

-- CreateIndex
CREATE INDEX "error_patterns_user_id_language_idx" ON "error_patterns"("user_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "error_patterns_user_id_rule_key" ON "error_patterns"("user_id", "rule");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_items_learner_model_id_word_language_key" ON "vocabulary_items"("learner_model_id", "word", "language");

-- CreateIndex
CREATE INDEX "lessons_user_id_idx" ON "lessons"("user_id");

-- CreateIndex
CREATE INDEX "error_logs_user_id_idx" ON "error_logs"("user_id");

-- CreateIndex
CREATE INDEX "error_logs_rule_idx" ON "error_logs"("rule");

-- CreateIndex
CREATE INDEX "curriculum_vocab_language_cefr_level_idx" ON "curriculum_vocab"("language", "cefr_level");

-- CreateIndex
CREATE INDEX "curriculum_vocab_language_domain_idx" ON "curriculum_vocab"("language", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_vocab_language_word_key" ON "curriculum_vocab"("language", "word");

-- CreateIndex
CREATE INDEX "curriculum_grammar_language_cefr_level_idx" ON "curriculum_grammar"("language", "cefr_level");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_grammar_language_pattern_key" ON "curriculum_grammar"("language", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_key" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "daily_usage_user_id_date_idx" ON "daily_usage"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_usage_user_id_date_key" ON "daily_usage"("user_id", "date");

-- AddForeignKey
ALTER TABLE "learner_models" ADD CONSTRAINT "learner_models_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_patterns" ADD CONSTRAINT "error_patterns_learner_model_id_fkey" FOREIGN KEY ("learner_model_id") REFERENCES "learner_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_learner_model_id_fkey" FOREIGN KEY ("learner_model_id") REFERENCES "learner_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_usage" ADD CONSTRAINT "daily_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
