import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { DbNotConfiguredError } from "./db";
import type { ActionState } from "./action-types";
import { getCurrentUser, type CurrentUser } from "./session";

export type { ActionState } from "./action-types";

/**
 * Wraps a server action: signs the user in first (or sends them to log in and back),
 * and turns unexpected failures into a calm message instead of a crashed page.
 */
export async function runAsUser(
  returnTo: string,
  fn: (user: CurrentUser) => Promise<ActionState>,
): Promise<ActionState> {
  let user: CurrentUser | null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    unstable_rethrow(err);
    return { error: err instanceof DbNotConfiguredError ? "SpareSpace isn't connected to its database yet." : "Something went wrong on our side. Please try again." };
  }
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  try {
    return await fn(user);
  } catch (err) {
    unstable_rethrow(err); // redirect() and notFound() work by throwing
    console.error("[action] unexpected error", err instanceof Error ? err.message : err);
    return { error: "Something went wrong on our side. Please try again." };
  }
}
