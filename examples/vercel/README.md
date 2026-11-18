# Postgres and S3 locally

This example uses Postgres and a private S3 bucket. Docker Compose runs Postgres 17 and [Adobe S3Mock](https://github.com/adobe/S3Mock) with an `uploads` bucket. The app runs on your host.

From the repository root:

```sh
docker compose -f examples/vercel/compose.yaml up --wait
cp -n examples/vercel/.env.example examples/vercel/.env
pnpm dev:vercel
```

Copy the environment file only on the first run. If `.env` already exists, set the local database and S3 values from `.env.example` in it. The sample credentials are for local testing only. Both services bind to loopback; Postgres uses port 55432, S3 uses port 9090. These ports MUST be free.

Open <http://localhost:4323/admin>, create the first admin, and upload a file in Media. Completion should succeed. Open the file, rename or move it, then delete it. Upload an image to also check its generated variants.

The app uses `postgres()` and `s3()` in [tenon.config.ts](tenon.config.ts). For Neon or another hosted service, replace the database URL and S3 environment values; see the [Neon guide](../../docs/content/1.guide/frameworks.md#with-neon).

## Adapter tests

With the services running, run these from the repository root:

```sh
S3_TEST_ENDPOINT=http://localhost:9090 \
S3_TEST_BUCKET=uploads \
S3_TEST_REGION=us-east-1 \
S3_TEST_KEY=tenon \
S3_TEST_SECRET=tenon \
pnpm --filter tenoncms exec vitest run --project node src/media/storage/s3/s3.live.test.ts

POSTGRES_TEST_URL=postgres://tenon:tenon@localhost:55432/cms \
pnpm --filter tenoncms exec vitest run --project node src/db/migrations/migrate.live.test.ts
```

The S3 tests upload, read, move, delete and abort. The Postgres test creates a temporary database and checks concurrent migrations, then drops it. The Compose user can create databases.

S3Mock accepts dummy credentials and does not validate presigned signatures or expiration. These tests check API compatibility; verify signing and permissions against your real provider too.

## Stop or reset

```sh
docker compose -f examples/vercel/compose.yaml down
```

Named volumes keep the database and S3 files between runs. To delete all local test data, including accounts, content and uploads:

```sh
docker compose -f examples/vercel/compose.yaml down --volumes
```
