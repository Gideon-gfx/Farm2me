import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Camera, Mail, MapPin, Pencil, Phone, User as UserIcon, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../lib/auth";
import { captureLocation } from "../lib/location";
import type { User } from "../lib/types";

// Bare profile view — no page chrome, so it can render either standalone
// (wrapped in AppShell, see Profile.tsx) or nested inside a dashboard shell
// (e.g. /farmer/:name/profile, which provides its own AppShell already).
export default function ProfileContent() {
  const { user, updateUser } = useAuth();
  const [locating, setLocating] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInput = useRef<HTMLInputElement | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  function startEditing() {
    setFullName(user!.fullName);
    setEmail(user!.email ?? "");
    setPhoneNumber(user!.phoneNumber ?? "");
    setError(null);
    setEditing(true);
  }

  async function saveEdits() {
    if (!fullName.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.patch<{ user: User }>("/auth/profile", {
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
      });
      updateUser(data.user);
      toast.success("Profile updated");
      setEditing(false);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  function refreshLocation() {
    setLocating(true);
    captureLocation((u) => {
      updateUser(u);
      setLocating(false);
      toast.success("Location updated");
    });
    // captureLocation silently no-ops on denial/timeout; stop spinning either way.
    setTimeout(() => setLocating(false), 10000);
  }

  async function onPhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const { data } = await api.post<{ user: User }>("/auth/photo", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      updateUser(data.user);
      toast.success("Profile photo updated");
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? "Could not upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-primary-dark">Profile</h1>
        {!editing && (
          <button
            onClick={startEditing}
            className="flex items-center gap-1.5 text-sm font-bold text-accent-dark"
          >
            <Pencil size={14} /> Edit profile
          </button>
        )}
      </div>

      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-border bg-white p-5">
        <button
          onClick={() => photoInput.current?.click()}
          disabled={uploadingPhoto}
          className="group relative flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-full bg-primary text-xl font-extrabold text-[#F5EFE2] disabled:opacity-70"
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            user.fullName.slice(0, 1).toUpperCase()
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
            <Camera size={18} className="text-white" />
          </span>
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPhotoChosen}
        />
        <div>
          <div className="text-lg font-extrabold text-primary-dark">{user.fullName}</div>
          <div className="text-sm text-muted">{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</div>
          <button
            onClick={() => photoInput.current?.click()}
            disabled={uploadingPhoto}
            className="mt-1 text-xs font-bold text-accent-dark disabled:opacity-50"
          >
            {uploadingPhoto ? "Uploading…" : user.avatarUrl ? "Change photo" : "Add a photo"}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-4 rounded-2xl border border-border bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-primary-dark">Edit details</h2>
            <button onClick={() => setEditing(false)} className="text-muted">
              <X size={18} />
            </button>
          </div>

          <label className="mt-4 block text-sm font-bold text-primary-dark">Full name</label>
          <input className="input mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} />

          <label className="mt-3 block text-sm font-bold text-primary-dark">Email</label>
          <input
            className="input mt-1"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="mt-3 block text-sm font-bold text-primary-dark">Phone number</label>
          <input className="input mt-1" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}

          <div className="mt-4 flex gap-2.5">
            <button
              onClick={() => setEditing(false)}
              className="btn-outline flex-1 !min-h-0 !py-2.5"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={saveEdits}
              className="btn-primary flex-1 !min-h-0 !py-2.5"
              disabled={saving || !fullName.trim()}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col divide-y divide-border rounded-2xl border border-border bg-white">
          <div className="flex items-center gap-3 p-4">
            <Mail size={18} className="text-muted" />
            <div>
              <div className="text-xs font-bold text-muted">Email</div>
              <div className="text-sm font-semibold text-primary-dark">{user.email ?? "Not set"}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4">
            <Phone size={18} className="text-muted" />
            <div>
              <div className="text-xs font-bold text-muted">Phone number</div>
              <div className="text-sm font-semibold text-primary-dark">{user.phoneNumber ?? "Not linked"}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4">
            <MapPin size={18} className="text-muted" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-muted">Location</div>
              <div className="truncate text-sm font-semibold text-primary-dark">
                {user.locationLabel ?? "Not set"}
              </div>
            </div>
            <button
              onClick={refreshLocation}
              disabled={locating}
              className="whitespace-nowrap text-xs font-bold text-accent-dark disabled:opacity-50"
            >
              {locating ? "Locating…" : "Update"}
            </button>
          </div>

          <div className="flex items-center gap-3 p-4">
            <UserIcon size={18} className="text-muted" />
            <div>
              <div className="text-xs font-bold text-muted">Account</div>
              <div className="text-sm font-semibold text-primary-dark">
                {user.isVerified ? "Verified" : "Unverified"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
