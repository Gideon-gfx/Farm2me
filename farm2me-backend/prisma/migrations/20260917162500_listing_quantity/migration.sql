-- AlterTable
ALTER TABLE "EscrowTrip" ADD COLUMN     "listingQuantityKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "minOrderKg" DOUBLE PRECISION NOT NULL DEFAULT 1;
