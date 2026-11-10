import { definePlugin } from "tenoncms";
import type { ActionRegistration } from "tenoncms/admin";

/**
 * One-click Deploy buttons: in the admin's top bar and in the Manage section of the content menu. Each calls a deploy
 * hook, which rebuilds the prerendered pages. Admins only (the default of actions). The hook URL stays on the server.
 * The hook is called directly instead of through a job, because Vercel has no job clock.
 */
export function deploy(hookUrl: string) {
  const action = (nav: ActionRegistration["nav"]): ActionRegistration => ({
    label: { en: "Deploy", de: "Veröffentlichen" },
    nav,
    // A deploy takes minutes and replaces the live site, so the admin asks first.
    confirm: {
      en: "Rebuild and publish the live site with the current content?",
      de: "Die Live-Seite mit den aktuellen Inhalten neu bauen und veröffentlichen?",
    },
    run: async () => {
      const response = await fetch(hookUrl, { method: "POST" });
      if (!response.ok) throw new Error(`The deploy hook answered ${response.status}`);
      return {
        en: "Deploy started. It takes a few minutes.",
        de: "Deploy gestartet. Er dauert ein paar Minuten.",
      };
    },
  });

  return definePlugin({
    name: "deploy",
    admin: {
      actions: {
        deploy: action({ icon: "rocket", order: 50 }),
        analytics: {
          label: "Analytics",
          nav: { icon: "chart-line" },
          href: "https://plausible.io/example.com",
        },
        // The labels of the built-in section, so the button joins it, next to Jobs and Users.
        "deploy-menu": action({
          display: "content",
          group: { en: "Manage", de: "Verwaltung" },
          icon: "rocket",
          order: 95,
        }),
      },
    },
  });
}
