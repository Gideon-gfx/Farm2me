// Monnify requires an email. Google sign-ups already have a real one; phone
// sign-ups don't, so synthesise a stable one from their number. Every account
// has at least one of the two (email/password and Google signup both require
// an email; phone is otherwise the only identifier), so this always has
// something to return.
export function customerEmailFor(user: { phoneNumber: string | null; email: string | null }): string {
  if (user.email) return user.email;
  return `${user.phoneNumber!.replace("+", "")}@users.farm2me.ng`;
}
