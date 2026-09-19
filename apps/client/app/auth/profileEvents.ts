/** Fired on `window` after a successful name change, so the header's account menu (which reads the
 *  profile once) can refresh without a shared store. Its own module so the header can listen for it
 *  without importing `supabase.ts` statically: that must stay off the landing page's critical path. */
export const PROFILE_CHANGED_EVENT = "cc:profile-changed";
