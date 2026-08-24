import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowLeftIcon, CameraIcon, Loader2, LogOut } from "lucide-react";

import Loading from "@/components/loading/LoadingPage";
import { FIELD_INPUT } from "@/components/ui/fieldInput";
import LanguageSwitcher from "@/components/layout/header/LanguageSwitcher";
import ThemeToggle from "@/components/layout/header/ThemeToggle";
import { useLogout } from "@/services/auth/useLogout";
import { useProfile } from "@/services/profile/useProfile";
import useUpdateProfile from "@/services/profile/useUpdateProfile";
import { useUploadAvatar } from "@/services/profile/useUploadAvatar";
import type { ISupabaseProfile } from "@/types/data";
import { cn } from "@/utils/cn";

/**
 * The account surface.
 *
 * **Rewritten onto the design system**, not redesigned in scope: every field,
 * mutation and control it had is still here. It was the last page carrying
 * hard-coded colours from before the tokens existed — a violet page holding a
 * white card, which read as a different application the moment the board went
 * dark.
 *
 * **Deliberately outside the app shell.** Settings are a place you go, finish
 * with, and leave — not a view of the workspace — so the sidebar would only be
 * offering navigation nobody wants mid-edit. Back returns you to where you came
 * from, which is better than a rail full of boards.
 *
 * It is also the only home for theme and language now. They spent a while in
 * the sidebar footer, where two rarely-touched preferences crowded the busiest
 * corner of the rail; the profile row that used to sit beside them is the way
 * here.
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const logout = useLogout();

  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();

  const [form, setForm] = useState<ISupabaseProfile | null>(null);

  // Seed the editable copy from the fetched profile. Adjusting state during
  // render is React's documented answer to "reset state when a value changes";
  // doing it in an effect ran a second render pass every time and is what the
  // cascading-render rule flags. Behaviour is identical — `form` still tracks
  // each new `profile` identity.
  const [seededFrom, setSeededFrom] = useState<ISupabaseProfile | null>(null);

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

  const patch = (fields: Partial<ISupabaseProfile>) =>
    setForm({ ...form, ...fields });

  const displayName = form.full_name || form.username || "Your account";

  return (
    <div className="bg-canvas flex h-svh flex-col overflow-hidden">
      {/* The bar is full-bleed, its contents are not: they sit in the same
          `max-w-2xl` column the cards below do, so "Back" lines up with the left
          edge of the page's content instead of with the window. */}
      <header className="border-hairline flex min-h-12 shrink-0 items-center border-b px-5 md:px-6">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          {/* `navigate(-1)` rather than a link to `/`: you arrive here from a
              board, and going back to that board is what "back" means. The
              fallback matters only for someone who opened /profile directly. */}
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
          {/* IDENTITY — who this account is, before anything editable. */}
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

              {/* Narrowed from `image/*` to exactly what the bucket accepts
                  (M14): the `avatars` bucket carries an allow-list, so a picker
                  offering svg, gif or heic would let someone choose a file that
                  is rejected after they wait for the upload. SVG is excluded
                  deliberately rather than forgotten — it can carry script, and
                  these are served from our own origin. */}
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
              <p className="text-ink-3 truncate text-sm">{form.email}</p>
            </div>
          </section>

          {/* ACCOUNT — the four columns `profiles` actually has. */}
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
                value={form.email ?? ""}
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

          {/* PREFERENCES — the existing controls, given a home. */}
          <Section title="Preferences">
            <Row label="Theme" hint="Dark or light, remembered on this device.">
              <ThemeToggle />
            </Row>

            <Row label="Language" hint="English, Russian or Uzbek.">
              <LanguageSwitcher />
            </Row>
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

/** One titled card. Sections are how a settings page stays scannable. */
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

/** A labelled input. */
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

/** A setting whose control sits to the right of its description. */
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
