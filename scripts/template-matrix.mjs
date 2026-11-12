// Prints the CI jobs for templates/index.json: every template, framework and target with the default database and
// storage, plus each other database with the default storage and each other storage with the default database.
import { readFileSync } from "node:fs";

const index = JSON.parse(readFileSync(new URL("../templates/index.json", import.meta.url), "utf8"));
const jobs = Object.entries(index.templates).flatMap(([template, { frameworks }]) =>
  frameworks.flatMap((framework) =>
    index.frameworks[framework].targets.flatMap((target) => {
      const [database, ...databases] = index.targets[target].databases;
      const [storage, ...storages] = index.targets[target].storages;
      return [
        { database, storage },
        ...databases.map((other) => ({ database: other, storage })),
        ...storages.map((other) => ({ database, storage: other })),
      ].map((stack) => ({ template, framework, target, ...stack }));
    }),
  ),
);
console.log(JSON.stringify(jobs));
