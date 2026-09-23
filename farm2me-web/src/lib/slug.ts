// Turns a display name into a URL-safe slug for personalized dashboard
// routes (e.g. "/farmer/:name") — purely cosmetic, never used to look
// anyone up server-side. The signed-in user's own data always comes from
// their auth session, not from this URL segment.
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "me";
}
