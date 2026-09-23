-- Allow a phone number to hold more than one account (one per role) instead
-- of being globally unique. The verify-otp controller still enforces "one
-- account per phone" for everyone except a small QA allowlist — this only
-- changes what the database *permits*, not normal signup behavior.
DROP INDEX "User_phoneNumber_key";

-- Replaces it: at most one account per (phoneNumber, role) pair.
CREATE UNIQUE INDEX "User_phoneNumber_role_key" ON "User"("phoneNumber", "role");
