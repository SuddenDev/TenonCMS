import { z } from "zod";

/**
 * The email of an invite or a new user. Endpoints extend it for their body, and operations check their input with it,
 * so HTTP and server code share one rule.
 */
export const emailInput = z.object({ email: z.email() });
