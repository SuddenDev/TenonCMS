import { onMounted, ref } from "vue";
import { client } from "@/shared/api";

export type AuthStatus = { setup: boolean; signUp: boolean };

/**
 * Whether the first admin is missing and whether a visitor MAY sign up. Asked on every mount, because the first
 * sign-up ends the setup. A failed request counts as closed.
 */
export function useAuthStatus() {
  const status = ref<AuthStatus>();
  onMounted(async () => {
    status.value = await client
      .request<AuthStatus>("/auth-status")
      .catch(() => ({ setup: false, signUp: false }));
  });
  return status;
}
