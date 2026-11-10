import { type Kysely, sql } from "kysely";
import type { Migration } from "kysely/migration";

// The Postgres twin of `cms.ts`. Keys sort by name. A new migration MUST get a key in both lists.
// Times are milliseconds in `bigint`. JSON stays `text`, like SQLite; queries cast it to `jsonb`.
export const postgresMigrations: Record<string, Migration> = {
  "001_cms_tables": {
    async up(db: Kysely<any>) {
      // `rowid` orders rows created in the same millisecond, like SQLite's own `rowid`.
      await sql`CREATE TABLE cms_documents (
        id text PRIMARY KEY,
        collection text NOT NULL,
        data text NOT NULL,
        draft text,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        published_at bigint,
        created_by text,
        updated_by text,
        rowid bigint GENERATED ALWAYS AS IDENTITY
      )`.execute(db);
      await sql`CREATE INDEX cms_documents_collection_idx ON cms_documents (collection)`.execute(
        db,
      );
      // `/files` and `/img` look up media by key. `mediaByKey()` MUST repeat this expression and the filter.
      await sql`CREATE UNIQUE INDEX cms_media_key_idx ON cms_documents ((data::jsonb ->> 'key'))
        WHERE collection = 'media'`.execute(db);
      await sql`CREATE TABLE cms_globals (
        name text PRIMARY KEY,
        data text NOT NULL,
        draft text,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        published_at bigint
      )`.execute(db);
      await sql`CREATE TABLE cms_uploads (
        id text PRIMARY KEY,
        key text NOT NULL,
        folder text NOT NULL,
        filename text NOT NULL,
        mime_type text NOT NULL,
        size bigint NOT NULL,
        part_size bigint NOT NULL,
        adapter_upload_id text NOT NULL,
        user_id text,
        created_at bigint NOT NULL
      )`.execute(db);
      await sql`CREATE TABLE cms_document_locales (
        document_id text NOT NULL,
        locale text NOT NULL,
        data text NOT NULL,
        draft text,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        published_at bigint,
        PRIMARY KEY (document_id, locale)
      )`.execute(db);
      await sql`CREATE INDEX cms_document_locales_locale_idx ON cms_document_locales (locale)`.execute(
        db,
      );
      await sql`CREATE TABLE cms_global_locales (
        name text NOT NULL,
        locale text NOT NULL,
        data text NOT NULL,
        draft text,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        published_at bigint,
        PRIMARY KEY (name, locale)
      )`.execute(db);
      await sql`CREATE TABLE cms_schema_state (
        kind text NOT NULL,
        name text NOT NULL,
        localized text,
        PRIMARY KEY (kind, name)
      )`.execute(db);
      await sql`CREATE TABLE cms_invites (
        id text PRIMARY KEY,
        email text NOT NULL,
        role text NOT NULL,
        token_hash text NOT NULL,
        invited_by text NOT NULL,
        expires_at bigint NOT NULL,
        created_at bigint NOT NULL
      )`.execute(db);
      await sql`CREATE UNIQUE INDEX cms_invites_email_idx ON cms_invites (email)`.execute(db);
      await sql`CREATE UNIQUE INDEX cms_invites_token_idx ON cms_invites (token_hash)`.execute(db);
      await sql`CREATE TABLE cms_locks (
        target text NOT NULL,
        id text NOT NULL,
        user_id text NOT NULL,
        locked_at bigint NOT NULL,
        PRIMARY KEY (target, id)
      )`.execute(db);
      await sql`CREATE TABLE cms_versions (
        id text PRIMARY KEY,
        target text NOT NULL,
        doc_id text NOT NULL,
        locale text,
        status text NOT NULL,
        data text NOT NULL,
        created_by text,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        rowid bigint GENERATED ALWAYS AS IDENTITY
      )`.execute(db);
      await sql`CREATE INDEX cms_versions_doc_idx ON cms_versions (target, doc_id, created_at)`.execute(
        db,
      );
    },
  },
  // The Postgres twin of `010_cms_jobs`. `rowid` keeps jobs due in the same millisecond in the order they were queued.
  "002_cms_jobs": {
    async up(db: Kysely<any>) {
      await sql`CREATE TABLE cms_jobs (
        id text PRIMARY KEY,
        task text NOT NULL,
        payload text NOT NULL,
        status text NOT NULL,
        run_at bigint NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL,
        locked_until bigint,
        result text,
        error text,
        cron text,
        target text,
        doc_id text,
        locale text,
        created_by text,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        rowid bigint GENERATED ALWAYS AS IDENTITY
      )`.execute(db);
      await sql`CREATE INDEX cms_jobs_due_idx ON cms_jobs (status, run_at)`.execute(db);
      await sql`CREATE INDEX cms_jobs_target_idx ON cms_jobs (target, doc_id)`.execute(db);
      await sql`CREATE UNIQUE INDEX cms_jobs_cron_idx ON cms_jobs (cron, task, run_at)`.execute(db);
    },
  },
  // The Postgres twin of `011_cms_jobs_dedupe_key`.
  "003_cms_jobs_dedupe_key": {
    async up(db: Kysely<any>) {
      await sql`ALTER TABLE cms_jobs ADD COLUMN dedupe_key text`.execute(db);
      await sql`CREATE INDEX cms_jobs_dedupe_idx ON cms_jobs (task, dedupe_key)`.execute(db);
    },
  },
};
