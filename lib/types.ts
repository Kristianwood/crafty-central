/* ============================================================
   Crafty Central — domain types

   These mirror the shapes the old store.js handed to the views,
   deliberately. The database is normalised underneath, but it is
   assembled back into these objects at the edge, so the view code
   reads the same as it always did.
   ============================================================ */

/**
 * Roles, highest first. "owner" is the business owner's seat: it
 * holds every permission an admin has, plus the ones an admin must
 * not (granting the owner seat itself). There is normally exactly
 * one owner.
 */
export type Role = "owner" | "admin" | "moderator" | "crew";
export const ROLES: readonly Role[] = ["owner", "admin", "moderator", "crew"] as const;

export type JobStatus = "estimate" | "confirmed" | "wrapped" | "invoiced";
export type TimeOffStatus = "pending" | "approved" | "denied";
export type InvoiceStatus = "draft" | "sent" | "paid";
export type InquiryStatus = "new" | "converted" | "dismissed";

/** Crew roles a person can be tagged with, and booked on a job as. */
export const CREW_ROLES = ["Driver", "Chef", "Key", "Assist"] as const;
export type CrewRole = (typeof CREW_ROLES)[number];

/** Dietary restriction options for on-set crew. */
export const DIETARY = [
  "Vegetarian",
  "Vegan",
  "Pescatarian",
  "Gluten-free",
  "Dairy-free",
  "Halal",
  "Kosher",
  "Nut allergy",
  "Shellfish allergy",
] as const;

export interface Person {
  id: string;
  name: string;
  role: Role;
  position: string;
  phone: string;
  email: string;
  tags: string[];
  dietary: string[];
  /** true once they have signed up and set a password. */
  hasAccount: boolean;
}

export interface CrewSlot {
  role: string;
  personId: string;
}

/**
 * Per-day overrides. Anything unset falls back to the job-level
 * value. `menu` and `crew` are present only when that day has its
 * own list (copy-on-write) — an empty array is a real override
 * meaning "nobody / nothing on this day".
 */
export interface DayInfo {
  callTime?: string;
  wrapTime?: string;
  headcount?: number | "";
  location?: string;
  notes?: string;
  menu?: string[];
  crew?: CrewSlot[];
}

export interface JobRates {
  perHead: number | null;
  truckDay: number | null;
}

export interface Job {
  id: string;
  productionName: string;
  productionCompany: string;
  agency: string;
  pm: string;
  producers: string;
  headcount: number;
  location: string;
  /** ISO dates, ascending. */
  shootDays: string[];
  callTime: string;
  wrapTime: string;
  status: JobStatus;
  crew: CrewSlot[];
  menu: string[];
  rates: JobRates;
  notes: string;
  dayInfo: Record<string, DayInfo>;
  createdAt: string;
  sample?: boolean;
}

export interface Company {
  id: string;
  name: string;
  billingAddress: string;
  contactName: string;
  email: string;
  phone: string;
}

export interface MenuTemplate {
  id: string;
  name: string;
  items: string[];
}

export interface SetCrewMember {
  id: string;
  name: string;
  position: string;
  dietary: string[];
  notes: string;
}

export interface Inquiry {
  id: string;
  company: string;
  pm: string;
  email: string;
  phone: string;
  intExt: string;
  dayNight: string;
  headcount: number;
  shootDays: string[];
  notes: string;
  status: InquiryStatus;
  /** 'yyyy-mm-dd hh:mm:ss', server local time. */
  createdAt: string;
}

/* ---------- invoicing ---------- */

/**
 * One line on an invoice. Amount is always qty × unitPrice — it is
 * derived, never stored, so the lines and the total cannot disagree.
 * catalogItemId / kitId record where a line came from; they are
 * provenance only and survive the item or kit being deleted later.
 */
export interface InvoiceLine {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  catalogItemId?: string | null;
  kitId?: string | null;
}

/** The "Bill to" block, snapshotted onto the invoice when it is drafted. */
export interface BillTo {
  name: string;
  address: string;
  email: string;
  attn: string;
}

export interface Invoice {
  id: string;
  jobId: string;
  number: string;
  issuedOn: string;
  dueOn: string;
  status: InvoiceStatus;
  taxRate: number;
  /**
   * Empty on invoices drafted before lines existed; the domain then
   * prices them from the job exactly as it always did.
   */
  lines: InvoiceLine[];
  notes: string;
  /** ISO datetimes, or null until that step happens. */
  sentAt: string | null;
  paidAt: string | null;
  billTo: BillTo;
  /** true when the PDF that went out has been archived. */
  hasDocument: boolean;
}

/* ---------- kits & catalogue ---------- */

export type CatalogKind = "product" | "service";

/** One priced product or service in the catalogue. */
export interface CatalogItem {
  id: string;
  name: string;
  kind: CatalogKind;
  unit: string;
  unitPrice: number;
  description: string;
  active: boolean;
}

export interface KitItem {
  catalogItemId: string;
  qty: number;
}

/** A named bundle of catalogue items, dropped onto an invoice in one go. */
export interface Kit {
  id: string;
  name: string;
  description: string;
  items: KitItem[];
}

/* ---------- dashboard ---------- */

export type WidgetId =
  | "stats"
  | "requests"
  | "today"
  | "upcoming"
  | "invoices"
  | "timeoff"
  | "workload"
  | "notes";

export type WidgetSize = "full" | "half";

export interface DashboardWidget {
  id: WidgetId;
  size: WidgetSize;
}

export type StatId =
  | "jobsWeek"
  | "covers"
  | "attention"
  | "pipeline"
  | "requests"
  | "timeoff"
  | "outstanding"
  | "overdue";

/**
 * One person's dashboard. Widgets not listed are hidden; the stat
 * row shows the tiles in `stats`; `notes` is their own scratchpad.
 */
export interface DashboardLayout {
  widgets: DashboardWidget[];
  stats: StatId[];
  notes: string;
}

/* ---------- the rest ---------- */

export interface TimeOff {
  id: string;
  personId: string;
  start: string;
  end: string;
  reason: string;
  status: TimeOffStatus;
  createdAt: string;
}

export interface Message {
  id: string;
  channel: string;
  fromId: string;
  text: string;
  sentAt: number;
  deliverAt: number;
}

export interface AppNotification {
  id: string;
  audience: string;
  text: string;
  icon: string;
  at: number;
  read: boolean;
}

export interface Settings {
  quietStart: number;
  quietEnd: number;
  perHeadDefault: number;
  truckDayDefault: number;
}

export const DEFAULT_SETTINGS: Settings = {
  quietStart: 7,
  quietEnd: 21,
  perHeadDefault: 33,
  truckDayDefault: 850,
};

/** Everything a signed-in client needs to render the app. */
export interface Workspace {
  me: Person;
  people: Person[];
  jobs: Job[];
  companies: Company[];
  menus: MenuTemplate[];
  setCrew: SetCrewMember[];
  inquiries: Inquiry[];
  invoices: Invoice[];
  catalog: CatalogItem[];
  kits: Kit[];
  timeOff: TimeOff[];
  notifications: AppNotification[];
  /** Channels with something delivered since this person last looked. */
  unreadChannels: string[];
  settings: Settings;
  /** This person's own dashboard arrangement. */
  dashboard: DashboardLayout;
  /** The server's clock at load, so age maths never reads the client's. */
  now: number;
}
