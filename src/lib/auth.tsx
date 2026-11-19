import { useRouteContext, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { signOutFn } from "@/fns/auth";

export function useAuth() {
  const { user, unread } = useRouteContext({ from: "__root__" });
  const router = useRouter();
  const signOut = useServerFn(signOutFn);
  return {
    user,
    unread,
    refresh: () => router.invalidate(),
    signOut: async () => {
      await signOut();
      await router.invalidate();
      await router.navigate({ to: "/" });
    },
  };
}
