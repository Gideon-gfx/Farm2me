-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('FARMER', 'BUYER', 'TRANSPORTER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('GRADE_A', 'GRADE_B', 'GRADE_C');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('OPEN', 'LOCKED', 'IN_TRANSIT', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('FUNDS_LOCKED', 'IN_TRANSIT', 'DELIVERED', 'DISPUTED', 'RELEASED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "walletBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "locationLabel" TEXT,
    "accountNumber" TEXT,
    "bankCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "cropType" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "pricePerKg" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "grade" "Grade" NOT NULL,
    "imageUrls" TEXT[],
    "isPooled" BOOLEAN NOT NULL DEFAULT false,
    "poolId" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VillagePool" (
    "id" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "targetWeightKg" DOUBLE PRECISION NOT NULL,
    "currentWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3) NOT NULL,
    "pricePerKg" DECIMAL(14,2) NOT NULL,
    "cropType" TEXT NOT NULL,
    "status" "PoolStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VillagePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowTrip" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "poolId" TEXT,
    "driverId" TEXT,
    "buyerId" TEXT NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "logisticsFee" DECIMAL(14,2) NOT NULL,
    "platformFee" DECIMAL(14,2) NOT NULL,
    "farmerPayout" DECIMAL(14,2) NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'FUNDS_LOCKED',
    "pickupPin" TEXT NOT NULL,
    "deliveryPin" TEXT NOT NULL,
    "monnifyRef" TEXT,
    "driverLat" DOUBLE PRECISION,
    "driverLng" DOUBLE PRECISION,
    "driverLocationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscrowTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolContribution" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "PoolContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "escrowTripId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceUrls" TEXT[],
    "resolution" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "Listing_farmerId_idx" ON "Listing"("farmerId");

-- CreateIndex
CREATE INDEX "Listing_poolId_idx" ON "Listing"("poolId");

-- CreateIndex
CREATE INDEX "VillagePool_buyerId_idx" ON "VillagePool"("buyerId");

-- CreateIndex
CREATE INDEX "EscrowTrip_listingId_idx" ON "EscrowTrip"("listingId");

-- CreateIndex
CREATE INDEX "EscrowTrip_poolId_idx" ON "EscrowTrip"("poolId");

-- CreateIndex
CREATE INDEX "EscrowTrip_driverId_idx" ON "EscrowTrip"("driverId");

-- CreateIndex
CREATE INDEX "EscrowTrip_buyerId_idx" ON "EscrowTrip"("buyerId");

-- CreateIndex
CREATE INDEX "PoolContribution_poolId_idx" ON "PoolContribution"("poolId");

-- CreateIndex
CREATE INDEX "PoolContribution_farmerId_idx" ON "PoolContribution"("farmerId");

-- CreateIndex
CREATE INDEX "Dispute_escrowTripId_idx" ON "Dispute"("escrowTripId");

-- CreateIndex
CREATE INDEX "Dispute_raisedById_idx" ON "Dispute"("raisedById");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "VillagePool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VillagePool" ADD CONSTRAINT "VillagePool_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTrip" ADD CONSTRAINT "EscrowTrip_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTrip" ADD CONSTRAINT "EscrowTrip_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "VillagePool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTrip" ADD CONSTRAINT "EscrowTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTrip" ADD CONSTRAINT "EscrowTrip_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolContribution" ADD CONSTRAINT "PoolContribution_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "VillagePool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolContribution" ADD CONSTRAINT "PoolContribution_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_escrowTripId_fkey" FOREIGN KEY ("escrowTripId") REFERENCES "EscrowTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

