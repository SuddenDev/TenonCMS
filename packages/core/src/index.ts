export { type Api, type Cms, defineCms } from "./cms/index.ts";
export type { LocalApi } from "./cms/api/local-api.ts";
export type {
  CmsOptions,
  Localization,
  LocalizationOptions,
  PopulateOptions,
} from "./cms/config/options.ts";
export type { ImageProvider, ImagesOptions, MediaOptions, Storage } from "./media/index.ts";
export { defineCollection, defineGlobal } from "./schema/index.ts";
export type {
  Collection,
  CollectionHooks,
  GlobalHooks,
  RootHooks,
  Schema,
  Data,
  Doc,
  Field,
  Fields,
  File,
  Global,
  Image,
  Locale,
  MediaApi,
  MediaDoc,
  MediaHooks,
  MediaRead,
  Modifiers,
  Preview,
} from "./schema/index.ts";
export { definePlugin, type Plugin } from "./plugins/index.ts";

export type { AuthOptions } from "./auth/config/options.ts";
export type { Role, RoleOptions } from "./users/roles.ts";
export type { CmsUser } from "./admin/index.d.ts";
export type {
  EmailAdapter,
  EmailApi,
  EmailContent,
  EmailMessage,
  EmailOptions,
  EmailTemplate,
  EmailTemplateData,
  EmailTemplates,
  InviteTemplate,
  InviteTemplateData,
} from "./email/types.ts";
export {
  LinkedContentError,
  type LinkedReference,
  type DeleteOptions,
  ConflictError,
  type Reference,
  ValidationError,
} from "./errors.ts";
export {
  type BreadcrumbsOptions,
  breadcrumbs,
  localeFromPath,
  localizePath,
  SLUG_PATTERN,
  seoMeta,
  slugify,
  switchTarget,
} from "./helpers/index.ts";

export type { RichtextDocument, RichtextNode, RichtextReference } from "./richtext/config/types.ts";
