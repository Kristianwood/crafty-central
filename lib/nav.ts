/* ============================================================
   Navigation, and who is allowed to see what.

   The same list the sidebar built itself from, now also used by
   the layout to bounce someone away from a route their role does
   not include — the nav hiding a link was never a security
   boundary and is not being asked to be one.
   ============================================================ */

import type { Role } from "./types";

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  roles: Role[];
}

const ADMIN_UP: Role[] = ["owner", "admin"];
const MODERATOR_UP: Role[] = ["owner", "admin", "moderator"];
const EVERYONE: Role[] = ["owner", "admin", "moderator", "crew"];

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard", roles: MODERATOR_UP },
  { id: "calendar", label: "Calendar", icon: "calendar", href: "/calendar", roles: EVERYONE },
  { id: "schedule", label: "My Schedule", icon: "schedule", href: "/schedule", roles: EVERYONE },
  { id: "menus", label: "Menus", icon: "menu", href: "/menus", roles: MODERATOR_UP },
  { id: "chat", label: "Chat", icon: "chat", href: "/chat", roles: EVERYONE },
  { id: "directory", label: "Directory", icon: "directory", href: "/directory", roles: EVERYONE },
  { id: "finances", label: "Finances", icon: "finances", href: "/finances", roles: ADMIN_UP },
];

export const navFor = (role: Role): NavItem[] => NAV.filter((n) => n.roles.includes(role));

export const firstViewFor = (role: Role): string => navFor(role)[0]?.href ?? "/calendar";

/** Routes outside the nav that any signed-in person may open. */
const ALWAYS_ALLOWED = ["/brief", "/account"];

export function mayVisit(role: Role, pathname: string): boolean {
  if (ALWAYS_ALLOWED.some((p) => pathname.startsWith(p))) return true;
  const item = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  return item ? item.roles.includes(role) : true;
}

export const titleFor = (pathname: string): string => {
  if (pathname.startsWith("/brief")) return "Job Brief";
  return NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"))?.label ?? "Crafty Central";
};
