#!/usr/bin/env node
import { parseArgs, styleText } from "node:util";
import * as p from "@clack/prompts";
import { backupCommand } from "./commands/backup.command.ts";
import { loginCommand, logoutCommand } from "./commands/login.command.ts";
import { restoreCommand } from "./commands/restore.command.ts";
import { Cancelled } from "./ui.ts";
import { upgradeCommand } from "./commands/upgrade.command.ts";
import { usersCommand } from "./commands/users.command.ts";

const HELP = `Usage: tenon <command> [options]

Commands
  backup               Write a backup of all data, users and media included, into a ZIP file
  restore <file>       Replace all data with a backup. It cannot be undone
  upgrade              Install the latest tenoncms
  login [url]          Sign in to a deployed instance, for backup and restore. Asks for the URL without one
  logout <url>         Sign out again
  users create [email] Invite a user and print the invite link. Asks for what is missing
  users list           List the users with role and status
  users recover <email>
                       Print a link that signs the user in once, within an hour, and signs them out everywhere else
  users deactivate <email>
                       End the user's sessions and block sign-in. Asks first
  users reactivate <email>
                       Let a deactivated user sign in again
  users remove <email> Delete the user. It cannot be undone. Asks first

Where (backup, restore, users create)
  --url <url>          A running instance (TENON_URL). Without it, tenon.config.ts is loaded here
  --api-key <key>      An API key with the Backup permission (TENON_API_KEY), instead of tenon login
  --config <file>      The config to load without --url. Default: tenon.config.ts

Options
  --dry-run            Show what would happen, change nothing
  --yes                Ask nothing; restore, upgrade, users recover, deactivate and remove need it without a terminal
  --out <file>         backup: the file name
  --content-only       backup: content and media only, no users or API keys
  --no-media           backup: leave the media files out
  --backup             restore: back up the current data first (--no-backup skips the question)
  --role <role>        users create: the role. Default: admin for the first user, else editor
  --password           users create: create the user with a password instead of an invite, locally only
  --no-open            login: print the link instead of opening the browser
`;

const OPTIONS = {
  url: { type: "string" },
  "api-key": { type: "string" },
  config: { type: "string" },
  out: { type: "string" },
  role: { type: "string" },
  password: { type: "boolean" },
  "dry-run": { type: "boolean" },
  yes: { type: "boolean", short: "y" },
  "content-only": { type: "boolean" },
  media: { type: "boolean" },
  backup: { type: "boolean" },
  open: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

async function main() {
  const [major] = process.versions.node.split(".").map(Number);
  if (major! < 24) throw new Error(`tenon needs Node 24 or newer, this is ${process.version}`);

  const { values: flags, positionals } = parseArgs({
    options: OPTIONS,
    allowPositionals: true,
    allowNegative: true,
  });
  const [command, arg, value] = positionals;
  if (flags.help || !command) return void process.stdout.write(HELP);

  p.intro(styleText("inverse", ` tenon ${command} `));
  if (command === "backup") await backupCommand(flags);
  else if (command === "restore") await restoreCommand(arg, flags);
  else if (command === "upgrade") await upgradeCommand(flags);
  else if (command === "login") await loginCommand(arg, flags);
  else if (command === "logout") await logoutCommand(arg, flags);
  else if (command === "users") await usersCommand(arg, value, flags);
  else throw new Error(`Unknown command ${command}. Run tenon --help.`);
  p.outro("Done");
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    if (error instanceof Cancelled) p.cancel(error.message);
    else p.log.error((error as Error).message);
    process.exit(1);
  },
);
