/** The standalone admin page, loading the admin's client entry from `scripts` and `css` URLs. */
export function adminHtml(base: string, scripts: string[], css: string[] = []) {
  const head = [
    ...css.map((href) => `<link rel="stylesheet" href="${href}">`),
    ...scripts.map((src) => `<script type="module" src="${src}"></script>`),
  ].join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Integral CMS - Admin</title>
    ${head}
  </head>
  <body>
    <div id="admin" data-base="${base}"></div>
  </body>
</html>`;
}
