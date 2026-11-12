#!/usr/bin/env node
import { parseArgs, styleText } from "node:util";
import * as p from "@clack/prompts";
import { backupCommand } from "./backup.command.ts";
import { loginCommand, logoutCommand } from "./login.command.ts";
import { restoreCommand } from "./restore.command.ts";
import { Cancelled } from "./ui.ts";
import { upgradeCommand } from "./upgrade.command.ts";

const HELP = `Usage: tenon <command> [options]

Commands
  backup               Write a backup of all data, users and media included, into a ZIP file
  restore <file>       Replace all data with a backup. It cannot be undone
  upgrade              Install the latest tenoncms
  login <url>          Sign in to a deployed instance, for backup and restore
  logout <url>         Sign out again

Where (backup, restore)
  --url <url>          A running instance (TENON_URL). Without it, tenon.config.ts is loaded here
  --api-key <key>      An API key with the Backup permission (TENON_API_KEY), instead of tenon login
  --config <file>      The config to load without --url. Default: tenon.config.ts

Options
  --dry-run            Show what would happen, change nothing
  --yes                Ask nothing; restore and upgrade need it without a terminal
  --out <file>         backup: the file name
  --content-only       backup: content and media only, no users or API keys
  --no-media           backup: leave the media files out
  --backup             restore: back up the current data first (--no-backup skips the question)
  --admin <path>       login: the admin's path, if it is not /admin
  --no-open            login: print the link instead of opening the browser
`;

const OPTIONS = {
  url: { type: "string" },
  "api-key": { type: "string" },
  config: { type: "string" },
  out: { type: "string" },
  admin: { type: "string" },
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
  const [command, arg] = positionals;
  if (flags.help || !command) return void process.stdout.write(HELP);

  p.intro(styleText("inverse", ` tenon ${command} `));
  if (command === "backup") await backupCommand(flags);
  else if (command === "restore") await restoreCommand(arg, flags);
  else if (command === "upgrade") await upgradeCommand(flags);
  else if (command === "login") await loginCommand(arg, flags);
  else if (command === "logout") await logoutCommand(arg, flags);
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
