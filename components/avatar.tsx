/* The initials bubble. Colour is derived from the person's id, so
   the same face is the same colour on every device without anyone
   storing a preference. */

import { avatarColor, initials } from "@/lib/format";
import type { Person } from "@/lib/types";

export function Avatar({
  person,
  size,
}: {
  person: Person | undefined | null;
  size?: "sm" | "lg";
}) {
  if (!person) return null;
  return (
    <span
      className={`avatar ${size ?? ""}`.trim()}
      style={{ background: avatarColor(person.id) }}
      title={person.name}
    >
      {initials(person.name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
}: {
  people: (Person | undefined)[];
  max?: number;
}) {
  const known = people.filter(Boolean) as Person[];
  const shown = known.slice(0, max);
  const extra = known.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <Avatar key={p.id} person={p} size="sm" />
      ))}
      {extra > 0 && (
        <span className="avatar sm" style={{ background: "#a19786" }}>
          +{extra}
        </span>
      )}
    </span>
  );
}
