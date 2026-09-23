import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASSWORD_SALT_ROUNDS = 10;

// Seeds (or updates) a single ADMIN account so the web dashboard can be
// logged into with email/password. Email/password/name are configurable via
// env.
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@farm2me.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const fullName = process.env.SEED_ADMIN_NAME ?? "Farm2Me Admin";
  const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", isVerified: true, isSuspended: false, fullName, passwordHash },
    create: { email, passwordHash, fullName, role: "ADMIN", isVerified: true },
  });

  console.log(`✅ ADMIN ready: ${admin.fullName} (${admin.email})`);
  console.log("   Log in at the admin dashboard with this email and password.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
