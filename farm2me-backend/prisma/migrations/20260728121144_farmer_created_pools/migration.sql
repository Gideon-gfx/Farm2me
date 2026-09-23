-- DropForeignKey
ALTER TABLE "VillagePool" DROP CONSTRAINT "VillagePool_buyerId_fkey";

-- AlterTable
ALTER TABLE "VillagePool" ADD COLUMN     "createdByFarmerId" TEXT,
ALTER COLUMN "buyerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "VillagePool_createdByFarmerId_idx" ON "VillagePool"("createdByFarmerId");

-- AddForeignKey
ALTER TABLE "VillagePool" ADD CONSTRAINT "VillagePool_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VillagePool" ADD CONSTRAINT "VillagePool_createdByFarmerId_fkey" FOREIGN KEY ("createdByFarmerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
