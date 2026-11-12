# Releasing

`tenoncms`, `@tenoncms/cli` and `create-tenoncms` are published together, with one version. Every `package.json` of the workspace carries it, private ones included.

## A release

```sh
pnpm release
```

bumpp (`bumpp -r`) asks for the next version, writes it into every `package.json`, commits `chore: release vX.Y.Z`, tags `vX.Y.Z` and pushes both. The tag starts `.github/workflows/release.yml`:

1. `build`: checks that the tag matches the version of `packages/core`, runs `pnpm build:packages` and `pnpm test`, and packs the three public packages (`pnpm pack` turns `workspace:` ranges into versions).
2. `publish`: downloads the packed files and runs `npm publish` on each, with provenance. It installs nothing, so no dependency's install script runs while the job holds the publish right (`id-token: write`). A version that is already on npm is skipped, so a failed run can be re-run. A prerelease (`1.0.0-beta.1`) gets the dist-tag `next` instead of `latest`.
3. `github-release`: `changelogithub` writes the GitHub release from the conventional commits since the previous tag. It is the changelog; there is no `CHANGELOG.md`. `tenon upgrade` links to it.

Every action is pinned to a commit SHA. Renovate updates them.

Under 1.0, a minor version MAY break things. Say so in the commit (`feat!:` or a `BREAKING CHANGE:` footer), so the release notes show it.

## Trusted publishing

The workflow has no npm token. npm trusts it through OIDC instead (`id-token: write`). Set it up once per package:

1. Create the npm organization `tenoncms`, for `@tenoncms/cli`.
2. Publish each package once by hand, because npm MAY only offer trusted publishing for a package that exists:

   ```sh
   pnpm install --frozen-lockfile
   pnpm build:packages
   npm login
   pnpm -r publish --access public
   npm logout
   ```

3. On npmjs.com, open each package → Settings → Trusted publishing → GitHub Actions: repository `SuddenDev/TenonCMS`, workflow `release.yml`.
4. Then, in the same settings, disallow publishing with tokens.

`prepublishOnly` in each public package stops a publish without `dist/`. It cannot tell an old build from a new one, so build right before a manual publish.
