import { Link } from "react-router";
import { useProfile } from "@/services/profile/useProfile";

export default function UserAvatar() {
  const { data: profile } = useProfile();

  return (
    <div className="group relative">
      <Link to="/profile">
        <img
          src={
            profile?.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
              profile?.username || "User",
            )}`
          }
          className="border-hairline hover:border-brand size-8 rounded-full border object-cover transition-colors"
        />
      </Link>

      <div className="bg-elevated text-ink border-hairline pointer-events-none absolute top-11 right-0 z-50 w-max translate-y-2 rounded-control border px-3 py-1.5 text-xs opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
        {profile?.email}
      </div>
    </div>
  );
}
