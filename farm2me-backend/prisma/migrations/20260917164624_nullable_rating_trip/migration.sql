-- DropForeignKey
ALTER TABLE "Rating" DROP CONSTRAINT "Rating_tripId_fkey";

-- AlterTable
ALTER TABLE "Rating" ALTER COLUMN "tripId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "EscrowTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
