import { cors } from "hono/cors";
import { beforeAll, describe, expect, it } from "vitest";
import { defineCms, definePlugin } from "../index.ts";
import { admin, base, origin, post, setup } from "./setup.ts";

// The CMS runs on `origin`, the public site on another origin of the same site.
const site = "https://www.example.com";
const cms = defineCms({ ...base, site: { url: site }, auth: { ...base.auth, baseURL: origin } });

type Instance = { fetch(request: Request): Promise<Response> };

// A request to the CMS from a page on `from`.
const call = (
  path: string,
  from: string | null,
  init: RequestInit = {},
  instance: Instance = cms,
) => {
  const headers = new Headers(init.headers);
  if (from) headers.set("origin", from);
  return instance.fetch(new Request(`${origin}/_tenon${path}`, { ...init, headers }));
};
const preflight = (path: string, from: string | null, instance: Instance = cms) =>
  call(
    path,
    from,
    {
      method: "OPTIONS",
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-api-key",
      },
    },
    instance,
  );

let cookie: string;
beforeAll(async () => {
  const res = await post(setup(cms).fetch, "/auth/sign-up/email", admin);
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
});

describe("CORS", () => {
  it("answers a preflight from the site with credentials and only content-type", async () => {
    const res = await preflight("/admin/load", site);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(site);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-headers")).toBe("content-type");
  });

  it("lets the site read a credentialed GET and a 401", async () => {
    const ok = await call("/admin-bar?url=/&mode=site", site, { headers: { cookie } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe(site);
    expect(ok.headers.get("access-control-allow-credentials")).toBe("true");
    expect(ok.headers.get("vary")).toContain("Origin");

    const denied = await call("/admin-bar?url=/&mode=site", site);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("access-control-allow-origin")).toBe(site);
  });

  it("lets the site read content", async () => {
    for (const path of ["/collections/posts", "/globals/site", "/localization"]) {
      const res = await call(path, site);
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe(site);
    }
  });

  it("stays closed to the site on routes its pages do not call", async () => {
    const session = await call("/auth/get-session", site, { headers: { cookie } });
    expect(session.status).toBe(200);
    expect(session.headers.get("access-control-allow-origin")).toBeNull();

    for (const path of ["/auth/sign-in/email", "/api-keys", "/invites", "/setup", "/schema"]) {
      const answered = await preflight(path, site);
      expect(answered.headers.get("access-control-allow-origin")).toBeNull();
      expect(answered.status).not.toBe(204);
    }
  });

  it("allows no other origin", async () => {
    for (const from of [
      "https://evil.example",
      "http://www.example.com",
      "https://www.example.com.evil.example",
    ]) {
      const answered = await preflight("/admin/load", from);
      const read = await call("/admin-bar?url=/&mode=site", from, { headers: { cookie } });
      expect(answered.headers.get("access-control-allow-origin")).toBeNull();
      expect(read.headers.get("access-control-allow-origin")).toBeNull();
      expect(read.status).toBe(200);
    }
  });

  it("leaves a request without an origin as it is", async () => {
    const answered = await preflight("/admin/load", null);
    const read = await call("/collections/posts", null);
    expect(answered.status).not.toBe(204);
    for (const res of [answered, read]) {
      expect(res.headers.get("access-control-allow-credentials")).toBeNull();
      expect(res.headers.get("vary")).toBeNull();
    }
  });

  it("sends nothing without `site.url`", async () => {
    const plain = defineCms(base);
    for (const from of [origin, site]) {
      const res = await preflight("/admin/load", from, plain);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      expect(res.status).not.toBe(204);
    }
  });

  it("still refuses a form post from the site", async () => {
    const res = await call("/collections/posts", site, {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
        "sec-fetch-site": "same-site",
      },
      body: "title=Forged",
    });
    expect(res.status).toBe(403);
    expect(await cms.find("posts")).toEqual([]);
  });
});

describe("the `cors` option", () => {
  const staging = "https://staging.example.com";

  it("allows the origins it lists, with core's defaults for the rest", async () => {
    const listed = defineCms({ ...base, cors: { origin: [site, staging] } });
    for (const from of [site, staging]) {
      const res = await preflight("/admin/load", from, listed);
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(from);
      expect(res.headers.get("access-control-allow-credentials")).toBe("true");
      expect(res.headers.get("access-control-allow-headers")).toBe("content-type");
      expect(res.headers.get("access-control-allow-methods")).toBe("GET,POST");
    }
    const other = await preflight("/admin/load", "https://evil.example", listed);
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("passes Hono's other options on", async () => {
    const wide = defineCms({
      ...base,
      site: { url: site },
      cors: { allowMethods: ["GET", "POST", "PUT", "DELETE"], maxAge: 600 },
    });
    const res = await preflight("/collections/posts", site, wide);
    expect(res.headers.get("access-control-allow-origin")).toBe(site);
    expect(res.headers.get("access-control-allow-methods")).toContain("DELETE");
    expect(res.headers.get("access-control-max-age")).toBe("600");
  });

  it("keeps the other routes closed", async () => {
    const listed = defineCms({ ...base, cors: { origin: staging } });
    for (const path of ["/auth/get-session", "/api-keys", "/invites"]) {
      const res = await preflight(path, staging, listed);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
  });

  it("throws without an origin to allow", () => {
    expect(() => defineCms({ ...base, cors: { maxAge: 600 } })).toThrow(/`cors`/);
  });

  it("leaves every route to a plugin's own CORS middleware", async () => {
    const partner = "https://partner.example";
    const open = definePlugin({ name: "open", publicMiddleware: cors({ origin: partner }) });
    const res = await call("/auth-status", partner, {}, defineCms({ ...base, plugins: [open] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(partner);
  });
});
