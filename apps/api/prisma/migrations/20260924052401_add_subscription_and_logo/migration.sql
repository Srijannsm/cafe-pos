-- CreateEnum
CREATE TYPE "subscription_plan" AS ENUM ('starter', 'standard', 'premium');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('trial', 'active', 'overdue', 'cancelled');

-- AlterTable
ALTER TABLE "cafes" ADD COLUMN     "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "nextBillingAt" TIMESTAMP(3),
ADD COLUMN     "plan" "subscription_plan" NOT NULL DEFAULT 'starter',
ADD COLUMN     "setupFeePaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subscriptionNotes" TEXT,
ADD COLUMN     "subscriptionStatus" "subscription_status" NOT NULL DEFAULT 'trial',
ADD COLUMN     "trialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
