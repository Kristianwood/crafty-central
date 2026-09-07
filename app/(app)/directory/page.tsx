"use client";

/* ============================================================
   Crafty Central — Directory
   Three lists behind one search bar:
   - Employees: Crafty's own team (accounts, roles, crew tags)
   - On-set crew: production-side people we feed — dietary
     restrictions + notes, referenced when planning any job
   - Production companies: billing info for invoices
   ============================================================ */

import { Fragment, useState } from "react";
import { ROLE_LABELS, ROLE_RANK, mayAssignRole } from "@/lib/domain";
import { avatarColor, initials } from "@/lib/format";
import {
  CREW_ROLES,
  DIETARY,
  ROLES,
  type Company,
  type Person,
  type Role,
  type SetCrewMember,
} from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";

/* The list reads top-down by seniority — owner, admins, moderators,
   crew — which is exactly the domain's rank, lowest number first. */
const ROLE_ORDER: Record<Role, number> = ROLE_RANK;

/** Checkbox rows are all-or-nothing toggles over a list of strings. */
const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

export default function DirectoryView() {
  const { ws, can, openModal } = useWorkspace();
  const [query, setQuery] = useState("");
  /* null until the reader touches the disclosure themselves, so the
     default (open when there is anyone on file) still applies. */
  const [scToggled, setScToggled] = useState<boolean | null>(null);

  const q = query.trim().toLowerCase();
  const match = (...fields: (string | undefined)[]) =>
    !q || fields.some((f) => (f || "").toLowerCase().includes(q));

  const people = ws.people
    .slice()
    .sort(
      (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name),
    )
    .filter((p) => match(p.name, p.position, p.email));

  const setCrew = ws.setCrew
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((c) => match(c.name, c.position, (c.dietary || []).join(" ")));

  const canEdit = can("editDirectory");

  /* A search always opens the on-set section — a match must never be
     hidden inside a collapsed disclosure. */
  const scOpen = q ? true : (scToggled ?? ws.setCrew.length > 0);

  return (
    <div className="view-enter">
      <div className="dir-search">
        <span className="ds-icon">
          <Icon name="people" />
        </span>
        <input
          type="text"
          placeholder="Search everyone — employees, on-set crew, companies…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {query && (
          <button className="ds-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            <Icon name="x" />
          </button>
        )}
      </div>

      <div className="section-head">
        <div>
          <div className="section-title">Employees</div>
          <div className="section-hint">
            Crafty&apos;s own team — accounts, permissions, and crew roles.
          </div>
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => openModal(<PersonForm />)}>
            <Icon name="plus" /> Add employee
          </button>
        )}
      </div>

      {people.length ? (
        <div className="dir-list">
          {people.map((p) => (
            <div className="dir-row" key={p.id}>
              <Avatar person={p} />
              <div>
                <div className="d-name">{p.name}</div>
                <div className="d-pos">
                  {p.position}{" "}
                  {(p.tags || []).map((t) => (
                    <span className="crew-role-tag" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <span className={`role-tag ${p.role}`}>
                {p.role === "owner" && <Icon name="star" />}
                {ROLE_LABELS[p.role]}
              </span>
              <div className="d-contact">
                {p.phone}
                <br />
                {p.email}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  justifyContent: "flex-end",
                }}
              >
                {canEdit && (
                  <button
                    className="icon-btn"
                    style={{ width: 30, height: 30 }}
                    aria-label={`Edit ${p.name}`}
                    onClick={() => openModal(<PersonForm person={p} />)}
                  >
                    <Icon name="edit" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="people" title="No matches" sub={`No employee matches "${query}".`} />
      )}

      <details
        className="set-crew-wrap"
        open={scOpen}
        onToggle={(e) => setScToggled(e.currentTarget.open)}
      >
        <summary>
          <span className="ms-icon">
            <Icon name="directory" />
          </span>
          <span className="sc-sum-title">
            On-set crew
            <span className="section-hint" style={{ display: "block", fontWeight: 400 }}>
              Production-side people you feed — track their dietary restrictions once, reference
              them on any job.
            </span>
          </span>
          <span className="ms-state">
            <span className="pill neutral">{ws.setCrew.length}</span>
            <span className="chev">
              <Icon name="chevDown" />
            </span>
          </span>
        </summary>
        <div className="sc-body">
          {/* The old build showed this button to everyone and let the
              save fail; the API now requires editDirectory, so only
              people who can actually save it see it. */}
          {canEdit && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button className="btn primary" onClick={() => openModal(<SetCrewForm />)}>
                <Icon name="plus" /> Add on-set crew
              </button>
            </div>
          )}
          {setCrew.length ? (
            <div className="dir-list">
              {setCrew.map((c) => (
                <div className="sc-row" key={c.id}>
                  <div className="sc-top">
                    {/* On-set crew are not Person records, so the avatar
                        is built here from the same id → colour rule. */}
                    <span
                      className="avatar sm"
                      style={{ background: avatarColor(c.id) }}
                      title={c.name}
                    >
                      {initials(c.name)}
                    </span>
                    <div className="sc-who">
                      <span className="d-name">{c.name}</span>
                      <span className="d-pos">{c.position || ""}</span>
                    </div>
                    <div className="dir-diet">
                      {(c.dietary || []).length ? (
                        c.dietary.map((d) => (
                          <span className={`diet-tag ${/allerg/i.test(d) ? "severe" : ""}`} key={d}>
                            {d}
                          </span>
                        ))
                      ) : (
                        <span className="diet-tag none">No restrictions</span>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        className="icon-btn"
                        style={{ width: 30, height: 30 }}
                        aria-label={`Edit ${c.name}`}
                        onClick={() => openModal(<SetCrewForm member={c} />)}
                      >
                        <Icon name="edit" />
                      </button>
                    )}
                  </div>
                  {c.notes && (
                    <div className="sc-notes">
                      <Icon name="note" /> {c.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon="directory"
              style={{ padding: 26 }}
              title={q ? "No matches" : "Nobody on file yet"}
              sub={
                q
                  ? `No on-set crew matches "${query}".`
                  : "Add the ADs, gaffers, and directors you feed — their restrictions follow them to every job."
              }
            />
          )}
        </div>
      </details>

      {canEdit && <CompaniesSection query={query} />}
    </div>
  );
}

/* ============ Employee form (no dietary — that's for on-set crew) ============ */

function PersonForm({ person }: { person?: Person }) {
  const { ws, can, mutate, toast, closeModal } = useWorkspace();
  const p = person;
  const [name, setName] = useState(p?.name ?? "");
  const [position, setPosition] = useState(p?.position ?? "");
  const [role, setRole] = useState<Role>(p?.role ?? "crew");
  const [phone, setPhone] = useState(p?.phone ?? "");
  const [email, setEmail] = useState(p?.email ?? "");
  const [tags, setTags] = useState<string[]>(p?.tags ?? []);
  const [busy, setBusy] = useState(false);

  /* Which roles this actor may hand this person, by the same rule the
     server applies (mayAssignRole). The current role is always offered
     so the select never sits on a value missing from its own list. The
     owner seat counts as vacant when the only owner is the person being
     edited — that is how an admin can move it before anyone holds it. */
  const isSelf = !!p && p.id === ws.me.id;
  const current: Role | null = p?.role ?? null;
  const ownerExists = ws.people.some((x) => x.role === "owner" && x.id !== p?.id);
  const canManage = can("manageRoles");
  const roleOptions = ROLES.filter(
    (r) => r === (current ?? "crew") || mayAssignRole(ws.me.role, current, r, ownerExists),
  );
  const roleHint = isSelf
    ? "Change your own role from another account."
    : !ownerExists && !can("grantOwner")
      ? "No owner yet — an admin can seat one person as owner."
      : "The owner holds every permission. Only the owner can pass the seat on.";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await mutate("/api/people", {
        id: p?.id,
        name: name.trim(),
        position: position.trim(),
        role,
        tags,
        phone: phone.trim(),
        email: email.trim(),
        /* This form has no dietary field, so send what is already on
           file — the upsert replaces the whole record. */
        dietary: p?.dietary ?? [],
      });
      closeModal();
      toast(p ? "Employee updated" : "Added to the team", "check");
    } catch {
      /* A role this actor may not set, or the owner's record — the
         server has already said which, through mutate's toast. */
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!p) return;
    if (!confirm(`Remove ${p.name} from the directory?`)) return;
    setBusy(true);
    try {
      await mutate(`/api/people/${p.id}`, undefined, "DELETE");
      closeModal();
      toast("Removed", "x");
    } catch {
      /* Refused while they still have an account or a booking — the
         server's reason is already on screen. */
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <div>
          <div className="modal-title">{p ? "Edit employee" : "Add employee"}</div>
          <div className="modal-sub">
            Their account links up automatically when they sign up with this email.
          </div>
        </div>
        <button className="panel-close" aria-label="Close" onClick={closeModal}>
          <Icon name="x" />
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Full name</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Position</label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. Craft Service"
            />
          </div>
          <div className="field">
            <label>Role</label>
            {canManage ? (
              <>
                <select
                  value={role}
                  disabled={isSelf}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {roleOptions.map((r) => (
                    <option value={r} key={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <span className="hint">{roleHint}</span>
              </>
            ) : (
              <>
                {/* A moderator may fix a phone number but not a seat,
                    so the role is shown here rather than offered. */}
                <div className="role-static">
                  <span className={`role-tag ${role}`}>
                    {role === "owner" && <Icon name="star" />}
                    {ROLE_LABELS[role]}
                  </span>
                </div>
                <span className="hint">Only an admin can change someone&apos;s role.</span>
              </>
            )}
          </div>
          <div className="field">
            <label>Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (416) …"
            />
          </div>
          <div className="field wide">
            <label>Crew roles</label>
            <div className="tag-check-row">
              {CREW_ROLES.map((t) => (
                <label className="tag-check" key={t}>
                  <input
                    type="checkbox"
                    checked={tags.includes(t)}
                    onChange={() => setTags(toggle(tags, t))}
                  />
                  {t}
                </label>
              ))}
            </div>
            <span className="hint">
              Controls which dropdowns they appear in when booking crew on a job.
            </span>
          </div>
          <div className="field wide">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          {p && (
            <button
              type="button"
              className="btn danger"
              style={{ marginRight: "auto" }}
              onClick={onDelete}
              disabled={busy}
            >
              <Icon name="x" /> Remove
            </button>
          )}
          <button type="button" className="btn" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {p ? "Save" : "Add employee"}
          </button>
        </div>
      </form>
    </>
  );
}

/* ============ On-set crew form: dietary dropdown + notes ============ */

function SetCrewForm({ member }: { member?: SetCrewMember }) {
  const { mutate, toast, closeModal } = useWorkspace();
  const c = member;
  const [name, setName] = useState(c?.name ?? "");
  const [position, setPosition] = useState(c?.position ?? "");
  const [dietary, setDietary] = useState<string[]>(c?.dietary ?? []);
  const [notes, setNotes] = useState(c?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await mutate("/api/set-crew", {
        id: c?.id,
        name: name.trim(),
        position: position.trim(),
        dietary,
        notes: notes.trim(),
      });
      closeModal();
      toast(c ? "Updated" : "Added to on-set crew", "check");
    } catch {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!c) return;
    if (!confirm(`Remove ${c.name} from the on-set crew list?`)) return;
    setBusy(true);
    try {
      await mutate(`/api/set-crew/${c.id}`, undefined, "DELETE");
      closeModal();
      toast("Removed", "x");
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <div>
          <div className="modal-title">{c ? "Edit on-set crew" : "Add on-set crew"}</div>
          <div className="modal-sub">
            Their restrictions show up wherever you plan food for a job they&apos;re on.
          </div>
        </div>
        <button className="panel-close" aria-label="Close" onClick={closeModal}>
          <Icon name="x" />
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Who's on set"
            />
          </div>
          <div className="field">
            <label>Role on set</label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. 1st AD, Gaffer, Director"
            />
          </div>
          <div className="field wide">
            <label>Dietary restrictions</label>
            <div className="tag-check-row">
              {DIETARY.map((d) => (
                <label className="tag-check" key={d}>
                  <input
                    type="checkbox"
                    checked={dietary.includes(d)}
                    onChange={() => setDietary(toggle(dietary, d))}
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
          <div className="field wide">
            <label>Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Severity, preferences, anything the truck should know…"
            />
          </div>
        </div>
        <div className="modal-foot">
          {c && (
            <button
              type="button"
              className="btn danger"
              style={{ marginRight: "auto" }}
              onClick={onDelete}
              disabled={busy}
            >
              <Icon name="x" /> Remove
            </button>
          )}
          <button type="button" className="btn" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {c ? "Save" : "Add to on-set crew"}
          </button>
        </div>
      </form>
    </>
  );
}

/* ============ Production companies (admin/mod only) ============ */

function CompaniesSection({ query }: { query: string }) {
  const { ws, can, openModal } = useWorkspace();
  const q = query.trim().toLowerCase();
  /* Only an admin can save a company, so only an admin gets the
     controls — everyone else sees the book read-only. */
  const canBill = can("finances");

  const companies = ws.companies
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.contactName || "").toLowerCase().includes(q),
    );

  /* Jobs point at a company by name, not id — matched the same loose
     way the old build did. */
  const jobCount = (c: Company) =>
    ws.jobs.filter(
      (j) =>
        (j.productionCompany || "").trim().toLowerCase() === c.name.trim().toLowerCase(),
    ).length;

  return (
    <>
      <div className="section-head" style={{ marginTop: 38 }}>
        <div>
          <div className="section-title">Production companies</div>
          <div className="section-hint">
            Billing addresses on file flow straight onto estimates and invoices.
          </div>
        </div>
        {canBill && (
          <button className="btn primary" onClick={() => openModal(<CompanyForm />)}>
            <Icon name="plus" /> Add company
          </button>
        )}
      </div>

      {companies.length ? (
        <div className="dir-list">
          {companies.map((c) => {
            const n = jobCount(c);
            return (
              <div className="co-row" key={c.id}>
                <span className="co-mark">
                  <Icon name="briefcase" />
                </span>
                <div>
                  <div className="d-name">{c.name}</div>
                  <div className="d-pos">
                    {c.contactName || ""}
                    {c.contactName && n ? " · " : ""}
                    {n ? `${n} job${n === 1 ? "" : "s"}` : ""}
                  </div>
                </div>
                <div className="co-address">
                  {c.billingAddress ? (
                    c.billingAddress.split("\n").map((line, i) => (
                      <Fragment key={i}>
                        {i > 0 && <br />}
                        {line}
                      </Fragment>
                    ))
                  ) : (
                    <span style={{ color: "var(--red)" }}>No billing address</span>
                  )}
                </div>
                <div className="d-contact">
                  {c.email || ""}
                  <br />
                  {c.phone || ""}
                </div>
                {canBill && (
                  <button
                    className="icon-btn"
                    style={{ width: 30, height: 30 }}
                    aria-label={`Edit ${c.name}`}
                    onClick={() => openModal(<CompanyForm company={c} />)}
                  >
                    <Icon name="edit" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          icon="briefcase"
          title={q ? "No matches" : "No companies yet"}
          sub={
            q
              ? `No company matches "${query}".`
              : "Add the production companies you bill so invoices fill themselves in."
          }
        />
      )}
    </>
  );
}

function CompanyForm({ company }: { company?: Company }) {
  const { mutate, toast, closeModal } = useWorkspace();
  const c = company;
  const [name, setName] = useState(c?.name ?? "");
  const [billingAddress, setBillingAddress] = useState(c?.billingAddress ?? "");
  const [contactName, setContactName] = useState(c?.contactName ?? "");
  const [phone, setPhone] = useState(c?.phone ?? "");
  const [email, setEmail] = useState(c?.email ?? "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await mutate("/api/companies", {
        id: c?.id,
        name: name.trim(),
        billingAddress: billingAddress.trim(),
        contactName: contactName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });
      closeModal();
      toast(c ? "Company updated" : "Company added", "check");
    } catch {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!c) return;
    if (
      !confirm(
        `Remove ${c.name} from the directory? Existing jobs and invoices keep the name, but the billing address stops printing.`,
      )
    )
      return;
    setBusy(true);
    try {
      await mutate(`/api/companies/${c.id}`, undefined, "DELETE");
      closeModal();
      toast("Company removed", "x");
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <div>
          <div className="modal-title">{c ? "Edit company" : "Add production company"}</div>
          <div className="modal-sub">
            The billing address prints on every estimate and invoice for this company.
          </div>
        </div>
        <button className="panel-close" aria-label="Close" onClick={closeModal}>
          <Icon name="x" />
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="field wide">
            <label>Company name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bellwoods Motion Co."
            />
          </div>
          <div className="field wide">
            <label>Billing address</label>
            <textarea
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              placeholder={"Street, suite\nCity Province Postal"}
            />
          </div>
          <div className="field">
            <label>Billing contact</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Accounts payable contact"
            />
          </div>
          <div className="field">
            <label>Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field wide">
            <label>Billing email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ap@company.com"
            />
          </div>
        </div>
        <div className="modal-foot">
          {c && (
            <button
              type="button"
              className="btn danger"
              style={{ marginRight: "auto" }}
              onClick={onDelete}
              disabled={busy}
            >
              <Icon name="x" /> Delete
            </button>
          )}
          <button type="button" className="btn" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {c ? "Save" : "Add company"}
          </button>
        </div>
      </form>
    </>
  );
}
