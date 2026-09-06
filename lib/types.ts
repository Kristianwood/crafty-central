/* ============================================================
   Crafty Central — domain types

   These mirror the shapes the old store.js handed to the views,
   deliberately. The database is normalised underneath, but it is
   assembled back into these objects at the edge, so the view code
   reads the same as it always did.
   ============================================================ */

export type Role = "admin" | "moderator" | "crew";
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
  createdAt: string;
}

export interface Invoice {
  id: string;
  jobId: string;
  number: string;
  issuedOn: string;
  dueOn: string;
  status: InvoiceStatus;
  taxRate: number;
}

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
  timeOff: TimeOff[];
  notifications: AppNotification[];
  /** Channels with something delivered since this person last looked. */
  unreadChannels: string[];
  settings: Settings;
}
