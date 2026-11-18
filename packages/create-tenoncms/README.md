# create-tenoncms

Creates a project with [tenoncms](https://www.npmjs.com/package/tenoncms). Needs Node 24 or newer.

```sh
npm create tenoncms
```

It asks one question at a time: the folder, the site name, framework, template, where it runs, the database, where media files go, how images are resized, email, the sign-in methods, the package manager, install and git. The database and media questions offer only what works on the chosen target.

Each question has a flag: `--site-name`, `--framework`, `--template`, `--target`, `--database`, `--storage`, `--images` (the provider, e.g. `ipx`, `none`, `imgix`), `--email` (`none` or `smtp`), `--auth` (a comma list of `password`, `passkey`, `magic-link`, `email-otp`), `--pm`, `--install` / `--no-install`, `--git` / `--no-git`, and `--yes` for the defaults. `--templates <source>` takes another giget source or a local folder.

The starters live in `templates/` of the repository. See its README for how they are layered.
