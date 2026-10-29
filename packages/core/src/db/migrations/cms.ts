import { type Database } from "../types.ts";
import { isPostgres } from "../queries/document-sql.ts";
import { postgresMigrations } from "./postgres.ts";
import { type Kysely, sql } from "kysely";
import { type Migration, Migrator } from "kysely/migration";

// The SQLite migrations. Keys sort by name. Never edit a migration that has shipped; add a new one, here and in
// `postgres.ts`.
const cmsMigrations: Record<string, Migration> = {
  "001_cms_tables": {
    async up(db) {
      await sql`CREATE TABLE IF NOT EXISTS cms_documents (
        id text PRIMARY KEY NOT NULL,
        collection text NOT NULL,
        data text NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS cms_documents_collection_idx ON cms_documents (collection)`.execute(
        db,
      );
      await sql`CREATE TABLE IF NOT EXISTS cms_globals (
        name text PRIMARY KEY NOT NULL,
        data text NOT NULL,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )`.execute(db);
    },
  },
  // Uploads in progress. A row reserves its key and binds the upload to its user.
  "002_cms_uploads": {
    async up(db) {
      await sql`CREATE TABLE IF NOT EXISTS cms_uploads (
        id text PRIMARY KEY NOT NULL,
        key text NOT NULL,
        folder text NOT NULL,
        filename text NOT NULL,
        mime_type text NOT NULL,
        size integer NOT NULL,
        part_size integer NOT NULL,
        adapter_upload_id text NOT NULL,
        user_id text,
        created_at integer NOT NULL
      )`.execute(db);
    },
  },
  // `/files` and `/img` look up media by key. Queries MUST repeat this expression and the `collection` filter as literals,
  // or SQLite does not use the index.
  "003_cms_media_key": {
    async up(db) {
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS cms_media_key_idx ON cms_documents (json_extract(data, '$.key'))
        WHERE collection = 'media'`.execute(db);
    },
  },
  // Drafts and publish state. Every row so far was published on save.
  "004_cms_drafts": {
    async up(db) {
      for (const table of ["cms_documents", "cms_globals"]) {
        await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN draft text`.execute(db);
        await sql`ALTER TABLE ${sql.table(table)} ADD COLUMN published_at integer`.execute(db);
        await sql`UPDATE ${sql.table(table)} SET published_at = updated_at`.execute(db);
      }
    },
  },
  // Localized values live in locale rows, shared ones stay in the document row.
  // `cms_schema_state` records the localized keys per entry, so config changes can move data.
  "005_cms_locales": {
    async up(db) {
      await sql`CREATE TABLE IF NOT EXISTS cms_document_locales (
        document_id text NOT NULL,
        locale text NOT NULL,
        data text NOT NULL,
        draft text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        published_at integer,
        PRIMARY KEY (document_id, locale)
      )`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS cms_document_locales_locale_idx ON cms_document_locales (locale)`.execute(
        db,
      );
      await sql`CREATE TABLE IF NOT EXISTS cms_global_locales (
        name text NOT NULL,
        locale text NOT NULL,
        data text NOT NULL,
        draft text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        published_at integer,
        PRIMARY KEY (name, locale)
      )`.execute(db);
      await sql`CREATE TABLE IF NOT EXISTS cms_schema_state (
        kind text NOT NULL,
        name text NOT NULL,
        localized text,
        PRIMARY KEY (kind, name)
      )`.execute(db);
    },
  },
  // Pending invites. Only the hash of a token is stored.
  "006_cms_invites": {
    async up(db) {
      await sql`CREATE TABLE IF NOT EXISTS cms_invites (
        id text PRIMARY KEY NOT NULL,
        email text NOT NULL,
        role text NOT NULL,
        token_hash text NOT NULL,
        invited_by text NOT NULL,
        expires_at integer NOT NULL,
        created_at integer NOT NULL
      )`.execute(db);
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS cms_invites_email_idx ON cms_invites (email)`.execute(
        db,
      );
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS cms_invites_token_idx ON cms_invites (token_hash)`.execute(
        db,
      );
    },
  },
  // Who created and last changed a document. `NULL` for server code.
  "007_cms_authors": {
    async up(db) {
      await sql`ALTER TABLE cms_documents ADD COLUMN created_by text`.execute(db);
      await sql`ALTER TABLE cms_documents ADD COLUMN updated_by text`.execute(db);
    },
  },
  // Who edits a document or global in the admin. `target` is `collection:<name>` or `global:<name>`.
  "008_cms_locks": {
    async up(db) {
      await sql`CREATE TABLE IF NOT EXISTS cms_locks (
        target text NOT NULL,
        id text NOT NULL,
        user_id text NOT NULL,
        locked_at integer NOT NULL,
        PRIMARY KEY (target, id)
      )`.execute(db);
    },
  },
  // Past versions of documents and globals. `doc_id` is `''` for a global, `locale` `NULL` without localization.
  "009_cms_versions": {
    async up(db) {
      await sql`CREATE TABLE IF NOT EXISTS cms_versions (
        id text PRIMARY KEY NOT NULL,
        target text NOT NULL,
        doc_id text NOT NULL,
        locale text,
        status text NOT NULL,
        data text NOT NULL,
        created_by text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      )`.execute(db);
      await sql`CREATE INDEX IF NOT EXISTS cms_versions_doc_idx ON cms_versions (target, doc_id, created_at)`.execute(
        db,
      );
    },
  },
};

/** The Kysely migrator for the CMS tables of the database's dialect, with its own migration tables. */
export const migrator = (db: Kysely<Database>) =>
  new Migrator({
    db,
    provider: { getMigrations: async () => (isPostgres(db) ? postgresMigrations : cmsMigrations) },
    migrationTableName: "cms_kysely_migration",
    migrationLockTableName: "cms_kysely_migration_lock",
  });
