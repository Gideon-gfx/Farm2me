import AppShell from "../components/AppShell";
import ProfileContent from "../components/ProfileContent";

// Standalone route (/profile) for Buyer/Transporter/Admin. Farmer reaches
// the same content nested at /farmer/:name/profile instead, inside its own
// AppShell, so ProfileContent carries no page chrome itself.
export default function Profile() {
  return (
    <AppShell>
      <ProfileContent />
    </AppShell>
  );
}
