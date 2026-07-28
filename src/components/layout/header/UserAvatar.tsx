import { Link } from "react-router";
import { useProfile } from "../../../services/lib/profile/useProfile";

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
          className="h-12 w-12 rounded-full border-2 border-white object-cover"
        />
      </Link>

      <div className="pointer-events-none absolute top-2 -right-40 w-max translate-y-2 rounded-xl bg-gray-900 px-4 py-2 text-sm text-white opacity-0 shadow-xl transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        {profile?.email}
      </div>
    </div>
  );
}
