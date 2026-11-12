import type { RichtextDocument } from "../richtext/config/types.ts";
import type { LinkReference } from "../links/config/types.ts";
import type { ConflictOptions, DeleteOptions } from "../errors.ts";
import type { SyncChoice, SyncStructureOptions } from "../content/writes/sync-structure.ts";
import {
  type ExportOptions,
  type ImportMode,
  type Manifest,
  exportQuery,
} from "../transfer/format.ts";
import type { JobFilter } from "../jobs/types.ts";
import type { ScheduleOptions } from "../schedule/types.ts";
import type { Schema } from "../schema/index.ts";
import { API_BASE, API_KEY_HEADER } from "./constants.ts";
import { CmsError } from "./errors.ts";
import { createRequest } from "./create-request.ts";
import { readQuery, type ReadQuery } from "./read-query.ts";
import type {
  Client,
  ClientOptions,
  DiscardOption,
  ImportOptions,
  LocaleOption,
  Perspective,
  RegisteredCms,
} from "./types/index.ts";
import { createUpload, sendFile } from "./upload.ts";

type FindQuery = ReadQuery & { where?: object; limit?: number };
const when = (at: ScheduleOptions["at"]) =>
  typeof at === "string" ? at : new Date(at).toISOString();

// The implementation is untyped, so the locale is a plain string.
type Write = LocaleOption<{ localization: { locales: string[] } }>;
type Save = Write & ConflictOptions;
type Discard = DiscardOption<{ localization: { locales: string[] } }>;

/**
 * Typed HTTP client for `/_tenon`. It has the same methods as the local API, so code reads the same on
 * both sides. Use it in the browser: admin pages, islands, client components. On the server, call the
 * `cms` instance directly.
 *
 * Reads are public. Writes need an admin session cookie, so they work in admin pages.
 *
 * Collection and global names and document types come from the registered `cms`. See {@link Register}.
 * Pass a type argument to override it.
 * @example
 * import { createClient } from 'tenoncms/client'
 *
 * const client = createClient()
 * const posts = await client.find('posts', { where: { featured: true } })
 */
export function createClient<C extends { schema: Schema } = RegisteredCms>({
  baseUrl = "",
  fetch: fetchFn = fetch,
  apiKey,
}: ClientOptions = {}): Client<C> {
  const auth: Record<string, string> = apiKey ? { [API_KEY_HEADER]: apiKey } : {};
  const request = createRequest(baseUrl, fetchFn, auth);
  const uploader = { request, baseUrl, fetchFn, auth };
  const upload = createUpload(uploader);

  const enc = encodeURIComponent;
  const collection = (name: string) => `/collections/${enc(name)}`;
  const doc = (name: string, id: string) => `${collection(name)}/${enc(id)}`;
  const global = (name: string) => `/globals/${enc(name)}`;
  const user = async (path: string, data: object) => (await request("POST", path, data)).user;
  // Kept per client, so a language switch asks once.
  let localization: Promise<unknown> | undefined;

  // The implementation is untyped; `Client` types it for the host.
  const client = {
    find: (name: string, { where, limit, ...read }: FindQuery = {}) =>
      request("GET", collection(name), undefined, {
        ...where,
        ...(limit && { limit }),
        ...readQuery(read),
      }),

    findOne: async (name: string, options: FindQuery) =>
      (await client.find(name, { ...options, limit: 1 }))[0],

    findById: (name: string, id: string, options: ReadQuery = {}) =>
      request("GET", doc(name, id), undefined, readQuery(options)),

    create: (name: string, data: unknown, { locale }: Write = {}) =>
      request("POST", collection(name), data, { locale }),

    update: (name: string, id: string, data: unknown, { locale, updatedAt }: Save = {}) =>
      request("PUT", doc(name, id), data, { locale, updatedAt }),

    createDraft: (name: string, data: unknown, { locale }: Write = {}) =>
      request("POST", `${collection(name)}/draft`, data, { locale }),

    updateDraft: (name: string, id: string, data: unknown, { locale, updatedAt }: Save = {}) =>
      request("PUT", `${doc(name, id)}/draft`, data, { locale, updatedAt }),

    publish: (name: string, id: string, { locale, updatedAt }: Save = {}) =>
      request("POST", `${doc(name, id)}/publish`, undefined, { locale, updatedAt }),

    unpublish: (name: string, id: string, { locale, updatedAt }: Save = {}) =>
      request("POST", `${doc(name, id)}/unpublish`, undefined, { locale, updatedAt }),

    schedule: (name: string, id: string, { at, ...options }: ScheduleOptions) =>
      request("POST", `${doc(name, id)}/schedule`, { ...options, at: when(at) }),

    discard: (name: string, id: string, options: Discard = {}) =>
      request("DELETE", `${doc(name, id)}/draft`, undefined, options),

    duplicate: (name: string, id: string) => request("POST", `${doc(name, id)}/duplicate`),

    copyLocale: (name: string, id: string, { from, to }: { from: string; to: string }) =>
      request("POST", `${doc(name, id)}/locales/${enc(to)}/copy`, { from }),

    removeLocale: (name: string, id: string, locale: string) =>
      request("DELETE", `${doc(name, id)}/locales/${enc(locale)}`),

    setSyncStructure: (
      name: string,
      id: string,
      sync: SyncChoice,
      options: SyncStructureOptions = {},
    ) => request("POST", `${doc(name, id)}/structure`, { sync, ...options }),

    applySyncStructure: (name: string, { dryRun }: { dryRun?: boolean } = {}) =>
      request("POST", `${collection(name)}/structure/apply`, { dryRun }),

    lock: (name: string, id: string, { takeover = false } = {}) =>
      request("POST", `${doc(name, id)}/lock`, { takeover }),

    unlock: async (name: string, id: string) => {
      await request("DELETE", `${doc(name, id)}/lock`);
    },

    versions: (name: string, id: string, { locale }: Write = {}) =>
      request("GET", `${doc(name, id)}/versions`, undefined, { locale }),

    version: (name: string, id: string, version: string) =>
      request("GET", `${doc(name, id)}/versions/${enc(version)}`),

    restoreVersion: (name: string, id: string, version: string) =>
      request("POST", `${doc(name, id)}/versions/${enc(version)}/restore`),

    delete: (name: string, id: string, options: DeleteOptions = {}) =>
      request("DELETE", doc(name, id), undefined, options),

    getGlobal: (name: string, options: ReadQuery = {}) =>
      request("GET", global(name), undefined, readQuery(options)),

    setGlobal: (name: string, data: unknown, { locale, updatedAt }: Save = {}) =>
      request("PUT", global(name), data, { locale, updatedAt }),

    setGlobalDraft: (name: string, data: unknown, { locale, updatedAt }: Save = {}) =>
      request("PUT", `${global(name)}/draft`, data, { locale, updatedAt }),

    publishGlobal: (name: string, { locale, updatedAt }: Save = {}) =>
      request("POST", `${global(name)}/publish`, undefined, { locale, updatedAt }),

    unpublishGlobal: (name: string, { locale, updatedAt }: Save = {}) =>
      request("POST", `${global(name)}/unpublish`, undefined, { locale, updatedAt }),

    scheduleGlobal: (name: string, { at, ...options }: ScheduleOptions) =>
      request("POST", `${global(name)}/schedule`, { ...options, at: when(at) }),

    discardGlobal: (name: string, options: Discard = {}) =>
      request("DELETE", `${global(name)}/draft`, undefined, options),

    copyGlobalLocale: (name: string, { from, to }: { from: string; to: string }) =>
      request("POST", `${global(name)}/locales/${enc(to)}/copy`, { from }),

    removeGlobalLocale: (name: string, locale: string) =>
      request("DELETE", `${global(name)}/locales/${enc(locale)}`),

    setGlobalSyncStructure: (name: string, sync: SyncChoice, options: SyncStructureOptions = {}) =>
      request("POST", `${global(name)}/structure`, { sync, ...options }),

    lockGlobal: (name: string, { takeover = false } = {}) =>
      request("POST", `${global(name)}/lock`, { takeover }),

    unlockGlobal: async (name: string) => {
      await request("DELETE", `${global(name)}/lock`);
    },

    globalVersions: (name: string, { locale }: Write = {}) =>
      request("GET", `${global(name)}/versions`, undefined, { locale }),

    globalVersion: (name: string, version: string) =>
      request("GET", `${global(name)}/versions/${enc(version)}`),

    restoreGlobalVersion: (name: string, version: string) =>
      request("POST", `${global(name)}/versions/${enc(version)}/restore`),

    previewUrl: async (name: string, data: unknown, { locale }: { locale?: string } = {}) =>
      (await request("POST", `${collection(name)}/preview-url`, data, { locale })).url,

    previewGlobalUrl: async (name: string, data: unknown, { locale }: { locale?: string } = {}) =>
      (await request("POST", `${global(name)}/preview-url`, data, { locale })).url,

    getSchema: () => request("GET", "/schema"),

    localization: () =>
      (localization ??= request("GET", "/localization").catch((error) => {
        localization = undefined;
        throw error;
      })),

    signUp: (data: object) => user("/auth/sign-up/email", data),

    signIn: (data: object) => user("/auth/sign-in/email", data),

    requestPasswordReset: async (data: { email: string; redirectTo?: string }) => {
      await request("POST", "/auth/request-password-reset", data);
    },

    resetPassword: async (data: { token: string; newPassword: string }) => {
      await request("POST", "/auth/reset-password", data);
    },

    signOut: async () => {
      await request("POST", "/auth/sign-out", {});
    },

    getSession: () => request("GET", "/auth/get-session"),

    request: (
      path: string,
      { method = "GET", body, query } = {} as NonNullable<Parameters<Client["request"]>[1]>,
    ) => request(method, path, body, query),

    links: {
      resolve: (input: RichtextDocument | LinkReference[], options: { locale?: string } = {}) =>
        request(
          "POST",
          "/admin/links/resolve",
          Array.isArray(input)
            ? { references: input, ...options }
            : { document: input, ...options },
        ),
      search: (options = {}) => request("GET", "/admin/links/search", undefined, options),
    },

    media: {
      upload,
      update: (id: string, data: unknown) => request("PATCH", `/media/${enc(id)}`, data),
      renameFolder: (from: string, to: string) =>
        request("POST", "/media/folders/rename", { from, to }),
      delete: (id: string, options: DeleteOptions = {}) =>
        request("DELETE", `/media/${enc(id)}`, undefined, options),
      regenerate: (id: string, options: { force?: boolean } = {}) =>
        request("POST", `/media/${enc(id)}/regenerate`, options),
      folders: () => request("GET", "/media/folders"),
    },

    invites: {
      list: () => request("GET", "/invites"),
      create: (data: unknown) => request("POST", "/invites", data),
      resend: (id: string, data: unknown) => request("POST", `/invites/${enc(id)}/resend`, data),
      revoke: async (id: string) => {
        await request("DELETE", `/invites/${enc(id)}`);
      },
      check: (token: string) => request("POST", "/invites/check", { token }),
      accept: (data: unknown) => request("POST", "/invites/accept", data),
    },

    apiKeys: {
      list: () => request("GET", "/api-keys"),
      create: (data: unknown) => request("POST", "/api-keys", data),
      roll: (id: string) => request("POST", `/api-keys/${enc(id)}/roll`),
      revoke: async (id: string) => {
        await request("POST", `/api-keys/${enc(id)}/revoke`);
      },
      delete: async (id: string) => {
        await request("DELETE", `/api-keys/${enc(id)}`);
      },
    },

    jobs: {
      list: (filter: JobFilter = {}) => request("GET", "/jobs", undefined, filter),
      cron: () => request("GET", "/jobs/cron"),
      run: (id: string) => request("POST", `/jobs/${enc(id)}/run`),
      retry: (id: string) => request("POST", `/jobs/${enc(id)}/retry`),
      cancel: async (id: string) => {
        await request("DELETE", `/jobs/${enc(id)}`);
      },
    },

    export: async (options: ExportOptions = {}) => {
      const res = await fetchFn(`${baseUrl}${API_BASE}/export${exportQuery(options)}`, {
        headers: auth,
      });
      if (!res.ok) throw new CmsError(res.status, await res.json().catch(() => null));
      return res.blob();
    },

    exportLink: async (options: ExportOptions = {}) => {
      const { url } = await request("POST", `/export${exportQuery(options)}`, {});
      return url.startsWith("/") ? `${baseUrl}${url}` : url;
    },

    exportSummary: (options: ExportOptions = {}) =>
      request("GET", `/export/summary${exportQuery(options)}`),

    checkImport: (manifest: Manifest, { mode }: { mode?: ImportMode } = {}) =>
      request("POST", "/import/check", { manifest, mode }),

    import: async (archive: Blob, { mode, onProgress, signal }: ImportOptions = {}) => {
      // Without media storage, the route is missing and the archive goes in the body.
      const plan = await request("POST", "/import/uploads", { size: archive.size }).catch((e) => {
        if (e instanceof CmsError && e.status === 404) return undefined;
        throw e;
      });
      if (plan) {
        const path = `/import/uploads/${enc(plan.id)}`;
        return sendFile(uploader, path, archive, plan, { onProgress, signal }, (parts) =>
          request("POST", `${path}/complete`, { parts }, { mode }),
        );
      }

      // `request()` sends JSON only.
      const res = await fetchFn(`${baseUrl}${API_BASE}/import${mode ? `?mode=${enc(mode)}` : ""}`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/zip" },
        body: archive,
        signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new CmsError(res.status, data);
      onProgress?.({ loaded: archive.size, total: archive.size });
      return data;
    },

    preview: {
      enter: async (perspective: Perspective = "drafts") => {
        await request("POST", "/preview", { perspective });
      },
      exit: async () => {
        await request("DELETE", "/preview");
      },
    },
  };

  return client as unknown as Client<C>;
}
