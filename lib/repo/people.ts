/* ============================================================
   Crafty Central — people repository

   A person and a user account are the same record. Someone an
   admin adds to the Directory exists with no password_hash until
   they sign up with that email address, at which point they keep
   the role and position the admin already gave them.
   ============================================================ */

import { execute, jsonArray, query, queryOne } from "../db";
import { inferTags, uid } from "../domain";
import type { Person, Role } from "../types";

interface PersonRow {
  id: string;
  name: string;
  role: Role;
  position: string;
  phone: string;
  /** NULL when they have no email — see db/schema.sql. */
  email: string | null;
  tags: unknown;
  dietary: unknown;
  password_hash: string | null;
}

const toPerson = (r: PersonRow): Person => ({
  id: r.id,
  name: r.name,
  role: r.role,
  position: r.position,
  phone: r.phone,
  email: r.email ?? "",
  tags: jsonArray(r.tags),
  dietary: jsonArray(r.dietary),
  hasAccount: !!r.password_hash,
});

export async function listPeople(): Promise<Person[]> {
  const rows = await query<PersonRow>("SELECT * FROM people ORDER BY name");
  return rows.map(toPerson);
}

export async function getPerson(id: string): Promise<Person | null> {
  const r = await queryOne<PersonRow>("SELECT * FROM people WHERE id = ?", [id]);
  return r ? toPerson(r) : null;
}

/** Nobody is found by a blank address — that is not an identity. */
export async function getPersonByEmail(email: string): Promise<Person | null> {
  const wanted = (email || "").trim();
  if (!wanted) return null;
  const r = await queryOne<PersonRow>("SELECT * FROM people WHERE LOWER(email) = LOWER(?)", [
    wanted,
  ]);
  return r ? toPerson(r) : null;
}

/** The password hash is never part of the Person object handed around. */
export async function getPasswordHash(id: string): Promise<string | null> {
  const r = await queryOne<{ password_hash: string | null }>(
    "SELECT password_hash FROM people WHERE id = ?",
    [id],
  );
  return r?.password_hash ?? null;
}

export async function setPasswordHash(id: string, hash: string): Promise<void> {
  await execute("UPDATE people SET password_hash = ? WHERE id = ?", [hash, id]);
}

export const newPersonId = () => "p-" + uid();

export async function savePerson(input: Partial<Person> & { id?: string }): Promise<Person> {
  const id = input.id || newPersonId();
  const tags = input.tags?.length ? input.tags : inferTags(input.position || "");
  const person: Person = {
    id,
    name: input.name || "",
    role: (input.role || "crew") as Role,
    position: input.position || "",
    phone: input.phone || "",
    email: input.email || "",
    tags,
    dietary: input.dietary || [],
    hasAccount: input.hasAccount ?? false,
  };

  await execute(
    `INSERT INTO people (id, name, role, position, phone, email, tags, dietary)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       name=VALUES(name), role=VALUES(role), position=VALUES(position),
       phone=VALUES(phone), email=VALUES(email), tags=VALUES(tags),
       dietary=VALUES(dietary)`,
    [
      person.id,
      person.name,
      person.role,
      person.position,
      person.phone,
      // '' would collide with every other blank one under the unique key.
      person.email || null,
      JSON.stringify(person.tags),
      JSON.stringify(person.dietary),
    ],
  );

  return person;
}

export async function deletePerson(id: string): Promise<void> {
  await execute("DELETE FROM people WHERE id = ?", [id]);
}

export async function peopleCount(): Promise<number> {
  const rows = await query<{ n: number }>("SELECT COUNT(*) AS n FROM people");
  return Number(rows[0]?.n ?? 0);
}

/** Is the owner seat taken? Decides whether an admin may still claim it for someone. */
export async function ownerExists(excludingId?: string): Promise<boolean> {
  const rows = await query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM people WHERE role = 'owner' AND id <> ?",
    [excludingId ?? ""],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}
