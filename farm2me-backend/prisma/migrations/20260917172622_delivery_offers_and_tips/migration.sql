-- CreateEnum
CREATE TYPE "DeliveryOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TipStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "DeliveryOffer" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "DeliveryOfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tip" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "TipStatus" NOT NULL DEFAULT 'PENDING',
    "monnifyRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryOffer_tripId_idx" ON "DeliveryOffer"("tripId");

-- CreateIndex
CREATE INDEX "DeliveryOffer_driverId_idx" ON "DeliveryOffer"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOffer_tripId_driverId_key" ON "DeliveryOffer"("tripId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Tip_tripId_key" ON "Tip"("tripId");

-- AddForeignKey
ALTER TABLE "DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "EscrowTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOffer" ADD CONSTRAINT "DeliveryOffer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "EscrowTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
