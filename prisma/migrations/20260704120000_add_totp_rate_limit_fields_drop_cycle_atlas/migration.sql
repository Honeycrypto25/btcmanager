-- Add 2FA setup + OTP rate-limiting fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingTotpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "otpAttempts" INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "otpWindowStart" TIMESTAMP(3);

-- Drop Cycle Atlas feature tables (feature removed from the app)
DROP TABLE IF EXISTS "CycleAnalysisEvaluation" CASCADE;
DROP TABLE IF EXISTS "CycleAnalysisReport" CASCADE;
