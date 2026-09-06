/* ============================================================
   Crafty Central — who is asking

   Every server component and API route starts here. requireUser()
   is the one that matters: it either returns the signed-in person
   or throws, so a route cannot forget to check.
   ============================================================ */

import { cache } from "react";
import bcrypt from "bcryptjs";
import { can, type Permission } from "./domain";
import { getPerson } from "./repo/people";
import { sessionPersonId } from "./session";
import type { Person } from "./types";

/** Per-request memoised: several components can ask without re-querying. */
export const currentUser = cache(async (): Promise<Person | null> => {
  const id = await sessionPersonId();
  if (!id) return null;
  return getPerson(id);
});

export class Unauthorized extends Error {
  constructor() {
    super("Not signed in");
    this.name = "Unauthorized";
  }
}

export class Forbidden extends Error {
  constructor(perm: string) {
    super(`Not allowed: ${perm}`);
    this.name = "Forbidden";
  }
}

export async function requireUser(): Promise<Person> {
  const me = await currentUser();
  if (!me) throw new Unauthorized();
  return me;
}

/** Signed in *and* holding a permission. */
export async function requirePermission(perm: Permission): Promise<Person> {
  const me = await requireUser();
  if (!can(me.role, perm)) throw new Forbidden(perm);
  return me;
}

export const BCRYPT_ROUNDS = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
