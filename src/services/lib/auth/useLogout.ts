import { useMutation } from "@tanstack/react-query";
import { signOut } from "../../api/authApi";

// No cache clearing here: AuthProvider clears on the SIGNED_OUT event, which
// this mutation triggers along with every other way a session can end.
export function useLogout() {
  return useMutation({
    mutationFn: signOut,
  });
}
