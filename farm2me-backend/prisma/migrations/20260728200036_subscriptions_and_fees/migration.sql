-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'STANDARD', 'PREMIUM');

-- AlterTable
ALTER TABLE "EscrowTrip" ADD COLUMN     "distanceKm" DOUBLE PRECISION,
ADD COLUMN     "transporterPayout" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "transporterServiceFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "transporterVat" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE';
