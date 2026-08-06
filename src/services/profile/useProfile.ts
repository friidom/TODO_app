import { useQuery } from "@tanstack/react-query";
import { fetchProfile } from "./profileApi";
import { queryKeys } from "@/services/queryClient/queryKeys";
import { useAuth } from "../auth/useAuth";

export function useProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.profile(user?.id),
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });
}
