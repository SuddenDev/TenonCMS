/** An environment variable a part reads as `$NAME` in its code. */
export type EnvVar = {
  name: string;
  comment?: string;
  /** The value in `.env.example`. Without it, the line is commented out. */
  example?: string;
  default?: string;
  optional?: boolean;
  url?: boolean;
  min?: number;
};

type Blocks = { imports?: string[]; setup?: string[]; options?: string[] };

/**
 * `part.json` of a layer: the code it adds per file, its environment variables, `.gitignore` lines, and `builds`: the
 * dependencies whose install scripts MUST run. pnpm skips them unless approved.
 */
export type Part = {
  files?: Record<string, Blocks>;
  env?: EnvVar[];
  ignore?: string[];
  builds?: string[];
};

/** Every project has one. It comes first. */
export const SECRET_PART: Part = {
  files: { "tenon.config.ts": { options: ["secret: $CMS_SECRET,"] } },
  env: [{ name: "CMS_SECRET", example: "change-me-to-at-least-32-random-chars-please", min: 32 }],
};

const MARKER = /^(\s*)\/\/ @tenon-(imports|options|env)$/;

/**
 * Replaces each `// @tenon-imports`, `// @tenon-options` and `// @tenon-env` line of `text` with the parts' code for
 * `file`, indented like the marker. `$NAME` becomes `NAME`, imported from `envModule`, or reads `process.env`.
 * @throws When the code reads a variable no part declares.
 */
export function fillMarkers(text: string, file: string, parts: Part[], envModule?: string) {
  const env = envVars(parts);
  const used = new Set<string>();
  const code = (line: string) =>
    line.replace(/\$([A-Z][A-Z0-9_]*)/g, (_, name: string) => {
      const variable = env.get(name);
      if (!variable) throw new Error(`${file} reads $${name}, but no part declares it`);
      used.add(name);
      return envModule ? name : readProcessEnv(variable);
    });

  const blocks = parts.flatMap((part) => part.files?.[file] ?? []);
  const setup = blocks.flatMap((block) => block.setup ?? []).map(code);
  const options = blocks.flatMap((block) => block.options ?? []).map(code);
  const imports = [...new Set(blocks.flatMap((block) => block.imports ?? []))];
  if (envModule && used.size) imports.unshift(importLine([...used].sort(), envModule));

  const fill = {
    imports: setup.length ? [...imports, "", ...setup] : imports,
    options,
    env: [...env.values()].map(astroEnvField),
  };
  return text
    .split("\n")
    .flatMap((line) => {
      const match = MARKER.exec(line);
      if (!match) return [line];
      const [, indent, marker] = match as unknown as [string, string, keyof typeof fill];
      return fill[marker].map((added) => (added ? indent + added : added));
    })
    .join("\n");
}

/** `.env.example`: each variable with its comment. */
export function envExample(parts: Part[]) {
  const lines = [...envVars(parts).values()].flatMap((variable) => [
    ...(variable.comment ? [`# ${variable.comment}`] : []),
    variable.example === undefined
      ? `# ${variable.name}=${variable.default ?? ""}`
      : `${variable.name}=${variable.example}`,
  ]);
  return `${lines.join("\n")}\n`;
}

function importLine(names: string[], from: string) {
  const line = `import { ${names.join(", ")} } from "${from}";`;
  return line.length <= 100 ? line : `import {\n  ${names.join(",\n  ")},\n} from "${from}";`;
}

function envVars(parts: Part[]) {
  return new Map(parts.flatMap((part) => part.env ?? []).map((v) => [v.name, v]));
}

function readProcessEnv({ name, default: fallback, optional }: EnvVar) {
  if (fallback !== undefined) return `process.env.${name} ?? ${JSON.stringify(fallback)}`;
  return optional ? `process.env.${name}` : `process.env.${name}!`;
}

function astroEnvField({ name, default: fallback, optional, url, min }: EnvVar) {
  const options = [
    'context: "server"',
    'access: "secret"',
    min && `min: ${min}`,
    url && "url: true",
    fallback !== undefined && `default: ${JSON.stringify(fallback)}`,
    optional && "optional: true",
  ].filter(Boolean);
  return `${name}: envField.string({ ${options.join(", ")} }),`;
}
