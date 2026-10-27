# Smoke tests

Run these against an example after a change in an adapter, media, localization or invites.

- Give every run its own temp `DATABASE_URL` and temp uploads dir. Media defaults to `./.uploads` in the example.
- Never delete files inside `examples/*`. Clean up only your temp paths, by absolute path.
- A leftover database makes sign-up return 403, because only the first user may sign up.

```sh
B=localhost:3000; J=/tmp/jar
curl -s -c $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"name":"Admin","email":"a@b.co","password":"password123"}' $B/api/cms/auth/sign-up/email
curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"title":"Hello","slug":"hello"}' $B/api/cms/collections/posts
curl -s $B/
```

Expect 200, 201, and the post in the page HTML.

Media, on the standalone example (`B=127.0.0.1:3200` or a production build on another port): upload a PNG in one part, then fetch the original and a variant.

```sh
S=$(stat -f%z hero.png)  # Linux: stat -c%s
ID=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"filename\":\"hero.png\",\"mimeType\":\"image/png\",\"size\":$S}" $B/api/cms/media/uploads | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s -b $J -X PUT -H "origin: http://$B" --data-binary @hero.png $B/api/cms/media/uploads/$ID/parts/1
curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" -d '{"parts":[]}' $B/api/cms/media/uploads/$ID/complete
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $B/api/cms/media/files/hero.png
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "$B/api/cms/media/img/f_webp&q_80/hero.png"
```

Expect 201, `{"etag":"1"}`, the media document with `width` / `height`, `200 image/png` and `200 image/webp`.

Localization, on the Astro example (`B=localhost:4321`, `localization` on): create a post in German and read it in both languages.

```sh
curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d '{"title":"Hallo","slug":"hallo"}' "$B/api/cms/collections/posts?locale=de"
curl -s "$B/api/cms/collections/posts?locale=de&alternates=true"
curl -s "$B/api/cms/collections/posts?locale=en&fallback=false"
```

Expect 201 and the post with `"locale":"de"`, then `[]` (no English version, no fallback). Fetch `/de/posts/hallo` for the page.

Invites, on the Astro example with a temp `DATABASE_URL` and `SITE_URL` matching the port (the invite page MUST be on its origin): after the sign-up above, invite and accept with a second cookie jar.

```sh
K=/tmp/jar2
LINK=$(curl -s -b $J -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"email\":\"e@b.co\",\"role\":\"editor\",\"url\":\"http://$B/admin/invite\"}" $B/api/cms/invites \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).link')
curl -s -c $K -H 'content-type: application/json' -H "origin: http://$B" \
  -d "{\"token\":\"${LINK#*token=}\",\"name\":\"Ed\",\"password\":\"password123\"}" $B/api/cms/invites/accept
curl -s -o /dev/null -w '%{http_code}\n' -b $K $B/api/cms/invites
```

Expect a link (201, or 502 with the link when `SMTP_URL` points at no running catcher), `{ user }` with the session cookie, then `403`: the editor cannot manage invites. In Chrome, the Bitwarden extension's `BIT-NOTIFICATION-BAR-ROOT` overlay can swallow clicks at the top right of the admin; check with `document.elementFromPoint()` before suspecting the UI.
