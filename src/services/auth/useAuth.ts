import { useContext } from "react";
import { AuthContext } from "../../providers/authContext";

// Reads the one AuthProvider subscription. Same { user, loading } shape it had
// when it owned its own useState and its own onAuthStateChange.
export function useAuth() {
  const auth = useContext(AuthContext);

  if (!auth) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }

  return auth;
}
