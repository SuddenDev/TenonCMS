# Releasing

`tenoncms` and `create-tenoncms` are published together, with one version. Every `package.json` of the workspace carries it, private ones included.

## A release

Commit and push the release changes first. The working tree MUST be clean before running:

```sh
pnpm release
```

bumpp (`bumpp -r`) asks for the next version, writes it into every `package.json`, commits `chore: release vX.Y.Z`, tags `vX.Y.Z` and pushes both. The tag starts `.github/workflows/release.yml`:

1. `build`: checks that the tag matches the version of `packages/core`, runs `pnpm build:packages` and `pnpm test`, and packs the two public packages (`pnpm pack` turns `workspace:` ranges into versions).
2. `stage`: downloads the packed files and runs `npm stage publish` on each, with provenance. It installs nothing, so no dependency's install script runs while the job holds the publish right (`id-token: write`). Published versions are skipped. A prerelease (`1.0.0-beta.1`) gets the dist-tag `next` instead of `latest`.
3. `github-release`: `changelogithub --draft` prepares a draft GitHub release from the conventional commits since the previous tag. It is the changelog; there is no `CHANGELOG.md`. `tenon upgrade` links to the release once it is public.

After the workflow succeeds:

1. On npmjs.com, open the account's **Staged Packages** tab. Review the names, versions, contents and dist-tags of both `tenoncms` and `create-tenoncms`.
2. Approve both versions with npm 2FA. Approval publishes the packages; a successful staging job alone does not make them public.
3. Verify both exact versions on the registry, replacing `X.Y.Z` with the release version:

   ```sh
   npm view tenoncms@X.Y.Z version
   npm view create-tenoncms@X.Y.Z version
   ```

4. Open the draft under GitHub → Releases, review the notes and publish it. Both npm versions MUST be public first.

The approval step is documented in [npm's staged publishing guide](https://docs.npmjs.com/staged-publishing/).

Every action is pinned to a commit SHA. Renovate updates them.

Under 1.0, a minor version MAY break things. Say so in the commit (`feat!:` or a `BREAKING CHANGE:` footer), so the release notes show it.

## Retry a failed run

Before rerunning a failed staging job, check npm's **Staged Packages** tab. If a package from the run is pending, review and approve it first, then use GitHub Actions → Re-run failed jobs. The workflow skips that published version and stages the remaining package. If the pending package is wrong, reject it instead and correct the release before retrying. Do not approve an unexpected upload just to unblock a run.

Pending staged versions reserve their version number, but `npm view` only detects published versions. OIDC cannot run `npm stage list`, so the workflow does not try to skip pending versions or suppress staging errors. See the [npm stage command](https://docs.npmjs.com/cli/v11/commands/npm-stage/).

A rerun uses the workflow at the original tag. Workflow fixes MUST be committed before creating the next release tag; rerunning an older tag does not pick them up.

## Trusted publishing

The workflow has no npm token. npm trusts it through OIDC instead (`id-token: write`). Staging requires npm 11.15.0 or newer; the workflow uses Node 24 and its bundled npm. Set it up once for each package, `tenoncms` and `create-tenoncms`:

1. Enable 2FA on the maintainer's npm account.
2. On npmjs.com, open the package → Settings → Trusted publishing → GitHub Actions:

   | Field                | Value           |
   | -------------------- | --------------- |
   | Organization or user | `SuddenDev`     |
   | Repository           | `TenonCMS`      |
   | Workflow filename    | `release.yml`   |
   | Environment          | Leave blank     |
   | Allow `npm publish`  | Leave unchecked |

3. Under Publishing access, select **Require two-factor authentication and disallow tokens**. OIDC staging still works.

New trusted publisher configurations expire if their first successful publish does not complete within two days. Recreate an expired configuration before releasing. See [npm's trusted publishing guide](https://docs.npmjs.com/trusted-publishers/).

`prepublishOnly` in each public package stops a publish without `dist/`. It cannot tell an old build from a new one, so build right before a manual publish.
