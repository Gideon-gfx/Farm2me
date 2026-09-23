import { PrismaClient } from "@prisma/client";

// Single shared Prisma client instance reused across the app.
export const prisma = new PrismaClient();

export default prisma;
