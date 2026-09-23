import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowLeftIcon, CameraIcon, Loader2, LogOut } from "lucide-react";

import Loading from "@/components/loading/LoadingPage";
import { FIELD_INPUT } from "@/components/ui/fieldInput";
import LanguageSwitcher from "@/components/layout/header/LanguageSwitcher";
import ThemeToggle from "@/components/layout/header/ThemeToggle";
import DefaultPeriodSetting from "@/components/admin/DefaultPeriodSetting";
import ConnectedAccounts from "@/components/profile/ConnectedAccounts";
import { useLogout } from "@/services/auth/useLogout";
import { useProfile } from "@/services/profile/useProfile";
import useUpdateProfile from "@/services/profile/useUpdateProfile";
import { useUploadAvatar } from "@/services/profile/useUploadAvatar";
import { useAuth } from "@/services/auth/useAuth";
import type { Profile } from "@/services/profile/profileApi";
import { cn } from "@/utils/cn";

// deliberately outside the app shell — settings is a place you finish with and leave, not a workspace view
export default function ProfilePage() {
  const navigate = useNavigate();
  const logout = useLogout();

  const { data: profile, isLoading } = useProfile();
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();

  const [form, setForm] = useState<Profile | null>(null);

  // seeding during render, not an effect, to avoid a double render pass
  const [seededFrom, setSeededFrom] = useState<Profile | null>(null);

  if (profile && profile !== seededFrom) {
    setSeededFrom(profile);
    setForm(profile);
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file || !form) return;

    uploadAvatar.mutate(
      { file, userId: form.id },
      {
        onSuccess: (url) => {
          const updated = { ...form, avatar_url: url };

          setForm(updated);
          updateProfile.mutate(updated);
        },
      },
    );
  }

  if (isLoading || !form) return <Loading />;

  const patch = (fields: Partial<Profile>) => setForm({ ...form, ...fields });

  const displayName = form.full_name || form.username || "Your account";

  return (
    <div className="bg-canvas flex h-svh flex-col overflow-hidden">
      <header className="border-hairline flex min-h-12 shrink-0 items-center border-b px-5 md:px-6">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="border-hairline text-ink-2 hover:bg-elevated hover:text-ink focus-visible:ring-brand rounded-control text-meta flex h-8 items-center gap-1.5 border px-2.5 transition-colors outline-none focus-visible:ring-2"
          >
            <ArrowLeftIcon className="size-4" />
            Back
          </button>

          <h1 className="text-ink text-base font-semibold tracking-tight">
            Profile
          </h1>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 md:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <section className="border-hairline bg-surface rounded-surface flex items-center gap-4 border p-5">
            <label className="group relative size-16 shrink-0 cursor-pointer overflow-hidden rounded-full">
              <img
                src={
                  form.avatar_url ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`
                }
                alt=""
                className={cn(
                  "size-full object-cover transition-opacity duration-150",
                  uploadAvatar.isPending && "opacity-40",
                )}
              />

              <span className="coarse:opacity-100 absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                {uploadAvatar.isPending ? (
                  <Loader2 className="size-5 animate-spin text-white" />
                ) : (
                  <CameraIcon className="size-5 text-white" />
                )}
              </span>

              {/* matches the avatars bucket's allow-list — svg excluded on purpose, it can carry script and these serve from our origin */}
              <input
                hidden
                disabled={uploadAvatar.isPending}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleAvatarChange}
              />
            </label>

            <div className="min-w-0">
              <p className="text-ink truncate text-xl font-semibold tracking-tight">
                {displayName}
              </p>
              <p className="text-ink-3 truncate text-sm">{user?.email}</p>
            </div>
          </section>

          <Section title="Account">
            <Field label="Full name">
              <input
                value={form.full_name ?? ""}
                onChange={(e) => patch({ full_name: e.target.value })}
                placeholder="Your full name"
                className={FIELD_INPUT}
              />
            </Field>

            <Field label="Username">
              <input
                value={form.username ?? ""}
                onChange={(e) => patch({ username: e.target.value })}
                placeholder="Your username"
                className={FIELD_INPUT}
              />
            </Field>

            <Field
              label="Email"
              hint="Changing this is an auth operation, not a profile edit."
            >
              <input
                value={user?.email ?? ""}
                disabled
                className={cn(FIELD_INPUT, "text-ink-3 cursor-not-allowed")}
              />
            </Field>

            <Field label="Bio">
              <textarea
                rows={3}
                value={form.bio ?? ""}
                onChange={(e) => patch({ bio: e.target.value })}
                placeholder="Tell people what you work on"
                className={cn(FIELD_INPUT, "resize-none")}
              />
            </Field>

            <div className="flex items-center justify-end gap-3 pt-1">
              {updateProfile.isError && (
                <p className="text-status-red mr-auto text-xs">
                  {updateProfile.error.message}
                </p>
              )}

              <button
                type="button"
                onClick={() => updateProfile.mutate(form)}
                disabled={updateProfile.isPending}
                className="bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand rounded-control text-meta flex h-9 items-center gap-2 px-4 font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-60"
              >
                {updateProfile.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {updateProfile.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </Section>

          <Section title="Connected accounts">
            <ConnectedAccounts />
          </Section>

          <Section title="Preferences">
            <Row label="Theme" hint="Dark or light, remembered on this device.">
              <ThemeToggle />
            </Row>

            <Row label="Language" hint="English, Russian or Uzbek.">
              <LanguageSwitcher />
            </Row>

            {user?.org_role === "superadmin" && (
              <Row
                label="Default reporting period"
                hint="Which window the Superadmin screens open on."
              >
                <DefaultPeriodSetting />
              </Row>
            )}
          </Section>

          <Section title="Account actions">
            <Row
              label="Sign out"
              hint="Ends the session and clears the cached board."
            >
              <button
                type="button"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                className="border-status-red/30 text-status-red hover:bg-status-red/10 focus-visible:ring-status-red rounded-control text-meta flex h-9 items-center gap-2 border px-3 font-medium transition-colors outline-none focus-visible:ring-2 disabled:opacity-60"
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-hairline bg-surface rounded-surface border">
      <h2 className="border-hairline text-ink-3 text-mini border-b px-5 py-3 font-semibold tracking-[0.1em] uppercase">
        {title}
      </h2>

      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-ink-2 text-meta mb-1.5 block font-medium">
        {label}
      </span>
      {children}
      {hint && <span className="text-ink-3 mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-medium">{label}</p>
        <p className="text-ink-3 text-xs">{hint}</p>
      </div>

      <div className="shrink-0">{children}</div>
    </div>
  );
}
