import { describe, expect, it, vi } from "vitest";
import type { ActionRegistration } from "../admin/index.d.ts";
import { defineCms, definePlugin } from "../index.ts";
import { base, origin, post, setup, withAdmin } from "./setup.ts";

const editor = { name: "Ed", email: "e@b.co", password: "password123" };

const make = (actions: Record<string, ActionRegistration>, extra: object = {}) =>
  defineCms({ ...base, admin: { actions }, ...extra });

/** An admin and a signed-in editor on the same instance. */
async function adminAndEditor(cms: ReturnType<typeof make>) {
  const a = await withAdmin(cms);
  await a.create({ ...editor, role: "editor" });
  const e = setup(cms);
  await e.client.signIn(editor);
  return { a, e };
}

describe("admin actions", () => {
  it("lists the actions a user may run in /schema, without their functions", async () => {
    const run = vi.fn();
    const { a, e } = await adminAndEditor(
      make({
        deploy: {
          label: "Deploy",
          nav: { display: "main", icon: "rocket" },
          confirm: "Deploy the site now?",
          run,
        },
        ping: { label: { en: "Ping", de: "Anpingen" }, access: true, run },
      }),
    );

    expect((await a.client.getSchema()).admin?.actions).toEqual({
      deploy: {
        label: "Deploy",
        nav: { display: "main", icon: "rocket" },
        confirm: "Deploy the site now?",
      },
      ping: { label: { en: "Ping", de: "Anpingen" } },
    });
    expect(Object.keys((await e.client.getSchema()).admin?.actions ?? {})).toEqual(["ping"]);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs an action for a user its rule allows and answers its message", async () => {
    const run = vi.fn(({ user }: { user: { name: string } }) => `Started by ${user.name}`);
    const { a, e } = await adminAndEditor(make({ deploy: { label: "Deploy", run } }));

    const res = await post(a.fetch, "/admin/actions/deploy", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Started by Admin" });
    expect((await post(e.fetch, "/admin/actions/deploy", {})).status).toBe(403);
    expect((await post(a.fetch, "/admin/actions/nope", {})).status).toBe(404);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("lists a link action with its href and does not run it", async () => {
    const { a } = await adminAndEditor(
      make({ stats: { label: "Analytics", href: "https://plausible.io/example.com" } }),
    );

    expect((await a.client.getSchema()).admin?.actions).toEqual({
      stats: { label: "Analytics", href: "https://plausible.io/example.com" },
    });
    expect((await post(a.fetch, "/admin/actions/stats", {})).status).toBe(404);
  });

  it("needs a session", async () => {
    const { fetch } = setup(make({ deploy: { label: "Deploy", run: () => {} } }));
    const res = await fetch(`${origin}/_tenon/admin/actions/deploy`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("answers the message of an action that throws", async () => {
    const { a } = await adminAndEditor(
      make({
        deploy: {
          label: "Deploy",
          run: () => {
            throw new Error("The deploy hook answered 500");
          },
        },
      }),
    );

    const res = await post(a.fetch, "/admin/actions/deploy", {});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ message: "The deploy hook answered 500" });
  });

  it("merges plugin actions before the host's and throws for bad registrations", () => {
    const plugin = definePlugin({
      name: "deploy",
      admin: { actions: { deploy: { label: "Deploy", run: () => {} } } },
    });
    expect(() =>
      make({ deploy: { label: "Again", run: () => {} } }, { plugins: [plugin] }),
    ).toThrow(/duplicate.*"deploy"/);
    expect(() => make({ x: { label: "X" } as never })).toThrow(/run.*href/);
    expect(() => make({ x: { label: "X", href: "https://a.co", run: () => {} } as never })).toThrow(
      /run.*href/,
    );
    expect(() => make({ x: { label: "X", href: "javascript:alert(1)" } })).toThrow(/href/);
    expect(() =>
      make({ x: { label: "X", href: "https://a.co", confirm: "Sure?" } as never }),
    ).toThrow(/confirm/);
    expect(() => make({ x: { run: () => {} } as never })).toThrow(/label/);
    expect(() => make({ x: { label: "X", confirm: "", run: () => {} } })).toThrow(/confirm/);
    expect(() =>
      make({ x: { label: "X", nav: { display: "settings" as "main" }, run: () => {} } }),
    ).toThrow(/display/);
    expect(() => make({ x: { label: "X", access: ["nope"], run: () => {} } })).toThrow(/nope/);
  });
});
