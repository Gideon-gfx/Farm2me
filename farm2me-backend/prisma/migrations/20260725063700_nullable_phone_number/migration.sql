-- Google sign-up now creates an account with no phone number (see
-- googleAuth) — users add and verify one later via POST /auth/link-phone.
-- The (phoneNumber, role) unique index from the earlier multi-role-per-phone
-- migration is untouched: Postgres treats multiple NULLs as distinct, so any
-- number of phone-less accounts can coexist under it.
ALTER TABLE "User" ALTER COLUMN "phoneNumber" DROP NOT NULL;
