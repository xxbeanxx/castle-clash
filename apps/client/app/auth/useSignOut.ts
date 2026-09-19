import { useNavigate } from "react-router";

/**
 * Signs out and goes home, whether or not the sign-out itself succeeded (the player asked to leave;
 * a network error must not strand them on a private page).
 *
 * `supabase.js` is loaded on demand so the header can use this without putting supabase-js on the
 * landing page's critical path.
 */
export function useSignOut(): () => Promise<void> {
  const navigate = useNavigate();
  return async () => {
    try {
      const { signOut } = await import("./supabase.js");
      await signOut();
    } finally {
      navigate("/");
    }
  };
}
