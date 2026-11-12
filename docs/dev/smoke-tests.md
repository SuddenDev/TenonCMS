# Smoke tests

Run these against an example after a change in an adapter, media, localization, invites or API keys.

- Give every run its own temp `DATABASE_URL` and temp uploads dir. Media defaults to `./.uploads` in the example.
- Never delete files inside `examples/*`. Clean up only your temp paths, by absolute path.
- A leftover database makes sign-up return 403, because only the first user may sign up.

```sh
B=localhost:3000; J=/tmp/jar
curl -s -c $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"name":"Admin","email":"a@b.co","password":"password123"}' $B/_tenon/auth/sign-up/email
curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"title":"Hello","slug":"hello"}' $B/_tenon/collections/posts
curl -s $B/
```

Expect 200, 201, and the post in the page HTML.

API keys: create a read-only and a writing key for `posts` as the admin, then call without the cookie and without `Origin`.

```sh
R=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"name":"Read","permissions":{"collection:posts":["read"]}}' $B/_tenon/api-keys | node -pe 'JSON.parse(require("fs").readFileSync(0)).key')
W=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"name":"Write","permissions":{"collection:posts":["read","create"]}}' $B/_tenon/api-keys | node -pe 'JSON.parse(require("fs").readFileSync(0)).key')
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $R" $B/_tenon/collections/posts
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $R" -H 'content-type: application/json' -d '{"title":"No","slug":"no"}' $B/_tenon/collections/posts
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $W" -H 'content-type: application/json' -d '{"title":"Key","slug":"key"}' $B/_tenon/collections/posts
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: nope" $B/_tenon/collections/posts
```

Expect 200, 403, 201 and 401.

Media, on the standalone example (`B=127.0.0.1:3200` or a production build on another port): upload a PNG in one part, then fetch the original and a variant.

```sh
S=$(stat -f%z hero.png)  # Linux: stat -c%s
ID=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"filename\":\"hero.png\",\"mimeType\":\"image/png\",\"size\":$S}" $B/_tenon/media/uploads | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s -b $J -X PUT -H "origin: http://$B" --data-binary @hero.png $B/_tenon/media/uploads/$ID/parts/1
curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" -d '{"parts":[]}' $B/_tenon/media/uploads/$ID/complete
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $B/_tenon/media/files/hero.png
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "$B/_tenon/media/img/f_webp&q_80/hero.png"
```

Expect 201, `{"etag":"1"}`, the media document with `width` / `height`, `200 image/png` and `200 image/webp`.

Localization, on the Astro example (`B=localhost:4321`, `localization` on): create a post in German and read it in both languages.

```sh
curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"title":"Hallo","slug":"hallo"}' "$B/_tenon/collections/posts?locale=de"
curl -s "$B/_tenon/collections/posts?locale=de&alternates=true"
curl -s "$B/_tenon/collections/posts?locale=en&fallback=false"
```

Expect 201 and the post with `"locale":"de"`, then `[]` (no English version, no fallback). Fetch `/de/posts/hallo` for the page.

Invites, on the Astro example with a temp `DATABASE_URL` and `SITE_URL` matching the port (the invite page MUST be on its origin): after the sign-up above, invite and accept with a second cookie jar.

```sh
K=/tmp/jar2
LINK=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"email\":\"e@b.co\",\"role\":\"editor\",\"url\":\"http://$B/admin/invite\"}" $B/_tenon/invites \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).link')
curl -s -c $K -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"token\":\"${LINK#*token=}\",\"name\":\"Ed\",\"password\":\"password123\"}" $B/_tenon/invites/accept
curl -s -o /dev/null -w '%{http_code}\n' -b $K $B/_tenon/invites
```

Expect a link (201, or 502 with the link when `SMTP_URL` points at no running catcher), `{ user }` with the session cookie, then `403`: the editor cannot manage invites. In Chrome, the Bitwarden extension's `BIT-NOTIFICATION-BAR-ROOT` overlay can swallow clicks at the top right of the admin; check with `document.elementFromPoint()` before suspecting the UI.

Menus, on the Astro example (`B=localhost:4321`): after the sign-up above, link a page from the main menu, then resolve it and render the header.

```sh
P=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"title":"About","slug":"about"}' $B/_tenon/collections/pages | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s -o /dev/null -w '%{http_code}\n' -b $J -X PUT -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"items\":[{\"blockType\":\"link\",\"link\":{\"reference\":{\"collection\":\"pages\",\"id\":\"$P\"}},\"children\":[{\"blockType\":\"link\",\"label\":\"Docs\",\"link\":{\"href\":\"https://example.com\"}}]}]}" \
  $B/_tenon/globals/mainMenu
curl -s "$B/_tenon/globals/mainMenu"
curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"references\":[{\"collection\":\"pages\",\"id\":\"$P\"}]}" $B/_tenon/admin/links/resolve
curl -s $B/ | grep -o 'href="/about"[^>]*>About'
curl -s -o /dev/null -w '%{http_code}\n' -b $J -X DELETE -H "origin: http://$B" $B/_tenon/collections/pages/$P
```

Expect `200`; the menu with `"href":"/about","title":"About"` on the page link; `[{"href":"/about","title":"About"}]`; the link in the header HTML; then `409` (`LINKED_CONTENT`). In the admin, Settings › Main menu shows the tree: drag a row onto another, open its sheet, and check that the preview follows the edit.

## Jobs

Run after a change to a job clock (Nuxt, `tenonAdmin()`, Astro on Node, Cloudflare). Temporarily add a task and a cron entry to the example's config (revert it afterwards):

```ts
jobs: {
  secret: "smoke-secret",
  tasks: { smoke: defineTask({ run: () => void console.log("SMOKE TICK") }) },
  scheduledTasks: { "* * * * *": ["smoke"] },
},
```

```sh
B=localhost:3000
curl -s -o /dev/null -w '%{http_code}\n' $B/_tenon/jobs/run
curl -s -w ' %{http_code}\n' -H "Authorization: Bearer smoke-secret" $B/_tenon/jobs/run
curl -s -w ' %{http_code}\n' -X POST -H "Authorization: Bearer wrong" $B/_tenon/jobs/run
```

Expect `401`, `{"ran":0,"next":<ms of the next minute>} 200`, and `401`. Then wait up to 70 s without any request. Expect `SMOKE TICK` in the server log, once a minute. In Astro on Node the interval starts with the first page request, and the log of `astro dev` is read with `astro dev logs`. With `jobs: false` (`tenonCms: { jobs: false }` in `nuxt.config.ts`, `tenonAdmin({ jobs: false })`, `tenonCms({ jobs: false })` for Astro), nothing prints until a request to the route.

A scheduled publish. Add `schedule: true` to the collection (revert it afterwards), sign up as above, and schedule a draft for 65 s from now:

```sh
P=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"title":"Soon","slug":"soon"}' $B/_tenon/collections/posts/draft | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
AT=$(node -pe 'new Date(Date.now() + 65000).toISOString()')
curl -s -b $J -X POST -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"action\":\"publish\",\"at\":\"$AT\"}" $B/_tenon/collections/posts/$P/schedule
curl -s -b $J "$B/_tenon/jobs?status=queued"
```

Expect `{"id":"…"}`, then the job in the list. After the time and the next full minute, the post is in `curl -s $B/_tenon/collections/posts` with a `publishedAt` at that minute, and `curl -s -b $J "$B/_tenon/jobs?status=done"` lists the job with the result `"published"`.

The Cloudflare clock is covered by `durable-object.workerd.test.ts` (`pnpm test:full`). For `wrangler dev`, queue a job from a hook or a task and expect it to run without a request.

## Nuxt production build

Dev does not bundle core, so some breaks only show in `nuxt build`. The example renders no rich text, so add a throwaway page that does, build, and parse every server chunk.

```sh
cd examples/nuxt
printf '%s\n' '<script setup lang="ts">' 'import { Richtext } from "tenoncms/richtext/vue";' '</script>' \
  '<template><Richtext :content="null" /></template>' > app/pages/smoke.vue
npx nuxt build && for f in .output/server/chunks/**/*.mjs; do node --check "$f" || echo "$f"; done
rm app/pages/smoke.vue
```

Expect no output from the loop. Then start the build on another port and its own `DATABASE_URL`, and run the curl calls above. Expect the same codes, and 200 for `/smoke`.

## Postgres

PGlite runs the integration suite already. This checks `postgres()` and the `pg` pool against a real server, in a throwaway container.

```sh
docker run -d --rm --name tenon-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:17-alpine
export DATABASE_URL=postgres://postgres:pw@localhost:55432/postgres
```

Point an example's `database` at `postgres(process.env.DATABASE_URL!)` (add `pg` to it), start it, and run the curl calls above. Expect the same codes. Then `docker stop tenon-pg`; `--rm` deletes the data.

## Export and import

Run after a change to `transfer/` or an adapter's body handling. Sign up as above (cookie jar `$J`), then:

```sh
curl -s -b $J -o backup.zip -w '%{http_code} %{content_type}\n' $B/_tenon/export
unzip -l backup.zip
curl -s -b $J -X POST -H 'content-type: application/zip' --data-binary @backup.zip "$B/_tenon/import?mode=merge"
curl -s -b $J -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{}' $B/_tenon/import
```

Expect `200 application/zip`, a list with `manifest.json`, `documents.ndjson` and `media/…`, then counts like `{"cms_documents":12,…,"media":3}`, and `415`. Without the cookie, both routes answer `401`.

The staged path, as the admin uses it (local storage: one part, ETag `1`):

```sh
SIZE=$(wc -c < backup.zip | tr -d ' ')
ID=$(curl -s -b $J -H 'content-type: application/json' -d "{\"size\":$SIZE}" $B/_tenon/import/uploads | jq -r .id)
curl -s -b $J -X PUT -H 'content-type: application/octet-stream' --data-binary @backup.zip "$B/_tenon/import/uploads/$ID/parts/1"
curl -s -b $J -H 'content-type: application/json' -d '{"parts":[{"n":1,"etag":"1"}]}' "$B/_tenon/import/uploads/$ID/complete?mode=merge"
curl -s -b $J -X POST -H 'content-type: application/json' -d '{}' $B/_tenon/export
```

Expect `{"etag":"1"}`, the same counts, no file left under `.uploads/.tenon/`, and `{"url":"/_tenon/export"}` (with S3: a presigned bucket URL that downloads `tenon-<date>.zip`).
