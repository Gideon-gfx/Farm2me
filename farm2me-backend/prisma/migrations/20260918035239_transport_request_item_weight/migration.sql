/*
  Warnings:

  - Added the required column `itemDescription` to the `TransportRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weightKg` to the `TransportRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TransportRequest" ADD COLUMN     "itemDescription" TEXT NOT NULL,
ADD COLUMN     "weightKg" DOUBLE PRECISION NOT NULL;
