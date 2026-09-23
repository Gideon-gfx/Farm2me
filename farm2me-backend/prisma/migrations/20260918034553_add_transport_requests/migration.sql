-- CreateEnum
CREATE TYPE "TransportRequestStatus" AS ENUM ('OPEN', 'ACCEPTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransportTripStatus" AS ENUM ('FUNDS_LOCKED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED', 'RELEASED');

-- CreateEnum
CREATE TYPE "QuoteProposer" AS ENUM ('FARMER', 'DRIVER');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "TransportRequest" (
    "id" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "destinationLat" DOUBLE PRECISION,
    "destinationLng" DOUBLE PRECISION,
    "status" "TransportRequestStatus" NOT NULL DEFAULT 'OPEN',
    "driverId" TEXT,
    "agreedAmount" DECIMAL(14,2),
    "pickupPin" TEXT,
    "deliveryPin" TEXT,
    "tripStatus" "TransportTripStatus",
    "driverLat" DOUBLE PRECISION,
    "driverLng" DOUBLE PRECISION,
    "driverLocationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportQuote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "proposedBy" "QuoteProposer" NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportRequest_farmerId_idx" ON "TransportRequest"("farmerId");

-- CreateIndex
CREATE INDEX "TransportRequest_driverId_idx" ON "TransportRequest"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportQuote_requestId_driverId_key" ON "TransportQuote"("requestId", "driverId");

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRequest" ADD CONSTRAINT "TransportRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportQuote" ADD CONSTRAINT "TransportQuote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TransportRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportQuote" ADD CONSTRAINT "TransportQuote_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
