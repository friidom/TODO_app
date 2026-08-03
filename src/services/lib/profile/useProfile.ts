import { useQuery } from "@tanstack/react-query";
import { fetchProfile } from "../../api/profile/profileApi";
import { useAuth } from "../auth/useAuth";

export function useProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });
}
