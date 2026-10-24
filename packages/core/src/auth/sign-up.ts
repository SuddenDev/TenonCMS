import { type Kysely, sql } from "kysely";
import type { Database } from "../db/types.ts";

/**
 * Who MAY create an account without a session.
 * @returns `setup` while no user exists. `signUp` when a visitor MAY sign up: today only during setup.
 */
export async function signUpStatus(db: Kysely<Database>) {
  const { rows } = await sql<{ n: number }>`SELECT EXISTS (SELECT 1 FROM "user") AS n`.execute(db);
  const setup = !rows[0].n;
  return { setup, signUp: setup };
}
