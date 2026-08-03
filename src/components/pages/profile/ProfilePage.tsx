import { useEffect, useState } from "react";
import { useProfile } from "../../../services/lib/profile/useProfile";
import useUpdateProfile from "../../../services/lib/profile/useUpdateProfile";
import type { ISupabaseProfile } from "../../../types/data";
import Loading from "../loading/LoadingPage";
import { useNavigate } from "react-router";
import { useLogout } from "../../../services/lib/auth/useLogout";
import { ArrowLeft, Loader2, LogOut } from "lucide-react";
import { useUploadAvatar } from "../../../services/lib/profile/useUploadAvatar";

export default function ProfilePage() {
  const navigate = useNavigate();
  const logout = useLogout();

  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();

  const [form, setForm] = useState<ISupabaseProfile | null>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file || !form) return;

    uploadAvatar.mutate(
      {
        file,
        userId: form.id,
      },
      {
        onSuccess: async (url) => {
          const updated = {
            ...form,
            avatar_url: url,
          };

          setForm(updated);

          updateProfile.mutate(updated);
        },
      },
    );
  }
  useEffect(() => {
    if (profile) {
      setForm(profile);
    }
  }, [profile]);

  if (isLoading || !form) {
    return <Loading />;
  }

  function handleSave() {
    if (!form) return;
    updateProfile.mutate(form);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-violet-600">
      <div className="mx-auto mt-5 flex w-full max-w-xl flex-col gap-5 rounded-xl bg-white p-6 pb-4 shadow-lg">
        {/* avatar section */}
        <div className="flex flex-col items-center gap-4">
          <label className="group relative h-36 w-36 cursor-pointer overflow-hidden rounded-full">
            {uploadAvatar.isPending && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
              </div>
            )}
            <img
              src={
                form.avatar_url ||
                "https://ui-avatars.com/api/?name=" +
                  encodeURIComponent(form.username || "User")
              }
              className={`h-full w-full object-cover transition-all duration-300 group-hover:scale-110 ${uploadAvatar.isPending ? "opacity-40 blur-[2px]" : ""} `}
            />

            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition duration-300 group-hover:opacity-100">
              <span className="text-sm font-semibold text-white">Change</span>
            </div>

            <input
              hidden
              disabled={uploadAvatar.isPending}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-4 text-center">
          <h1 className="min-w-0 flex-1 text-4xl font-bold wrap-break-word">
            {form.full_name ? `${form.full_name}'s Profile` : "Profile"}
          </h1>
        </div>
        {/* form section */}
        <div>
          <label className="mb-1 block text-sm">Full name</label>

          <input
            className="w-full rounded border p-3"
            placeholder="your full name..."

            value={form.full_name ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                full_name: e.target.value,
              })
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-sm">Username</label>

          <input
            className="w-full rounded border p-3"
            placeholder="your username..."
            value={form.username ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                username: e.target.value,
              })
            }
          />
        </div>
        <input
          value={form.email ?? ""}
          disabled
          className="w-full rounded-lg border bg-gray-100 p-3 text-gray-500"
        />
        <div>
          <label className="mb-1 block text-sm">Bio</label>

          <textarea
            rows={5}
            className="w-full rounded border p-3"
            placeholder="tell about yourself..."
            value={form.bio ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                bio: e.target.value,
              })
            }
          />
        </div>
        {/* back section */}
        {/* actions */}
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-3 transition hover:bg-gray-100"
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <button
            onClick={() => logout.mutate()}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-200 px-4 py-3 text-red-500 transition hover:bg-red-50"
          >
            <LogOut size={18} />
            Logout
          </button>

          <button
            onClick={handleSave}
            disabled={updateProfile.isPending}
            className={`flex rounded-lg px-6 py-3 font-semibold text-white transition-all duration-300 ${
              updateProfile.isPending
                ? "cursor-not-allowed bg-violet-400 opacity-70"
                : "cursor-pointer bg-violet-600 hover:bg-violet-700"
            } `}
          >
            {updateProfile.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
