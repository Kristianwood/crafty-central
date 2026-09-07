"use client";

/* ============================================================
   Kits & catalogue — the legend an invoice is built from.

   Kits are cards in the menu-library style, each priced live
   through kitTotal() against the current catalogue; the
   catalogue itself is a table grouped products-then-services.
   Anyone with finances can read it; the edit controls only show
   for manageCatalog, and the server checks again.
   ============================================================ */

import { Empty } from "@/components/empty";
import { Icon } from "@/components/icons";
import { useWorkspace } from "@/components/workspace-provider";
import { catalogLine, kitTotal, lineAmount } from "@/lib/domain";
import { fmtMoney } from "@/lib/format";
import type { CatalogItem, Kit } from "@/lib/types";
import { CatalogItemForm } from "./catalog-item-form";
import { KitForm } from "./kit-form";

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

export function KitsTab() {
  const { ws, can, openModal } = useWorkspace();
  const manage = can("manageCatalog");
  const kits = ws.kits.slice().sort(byName);
  const products = ws.catalog.filter((c) => c.kind === "product").sort(byName);
  const services = ws.catalog.filter((c) => c.kind === "service").sort(byName);

  return (
    <>
      <div className="section-head">
        <div>
          <div className="section-title">Kits</div>
          <div className="section-hint">
            A named bundle of catalogue items, dropped onto an invoice in one go. Invoices keep a
            copy, so re-pricing a kit never changes one that already went out.
          </div>
        </div>
        {manage && (
          <button className="btn primary" onClick={() => openModal(<KitForm />)}>
            <Icon name="plus" /> New kit
          </button>
        )}
      </div>

      {kits.length ? (
        <div className="menu-grid stagger">
          {kits.map((k, i) => (
            <KitCard key={k.id} kit={k} index={i} manage={manage} />
          ))}
        </div>
      ) : (
        <Empty
          icon="box"
          title="No kits yet"
          sub={
            manage
              ? "Build one from the catalogue below — a standard shoot-day bundle is a good first kit."
              : "Kits are set up by an admin."
          }
        />
      )}

      <div className="section-head">
        <div>
          <div className="section-title">Catalogue</div>
          <div className="section-hint">
            Every product and service with its unit price. Inactive items stay for the record but
            are left out of the pickers.
          </div>
        </div>
        {manage && (
          <button className="btn primary" onClick={() => openModal(<CatalogItemForm />)}>
            <Icon name="plus" /> Add item
          </button>
        )}
      </div>

      {ws.catalog.length ? (
        <div className="fin-scroll">
          <table className="fin-table fin-catalog">
            <thead>
              <tr>
                <th>Item</th>
                <th>Unit</th>
                <th className="num">Unit price</th>
                <th>Status</th>
                {manage && <th />}
              </tr>
            </thead>
            <tbody>
              <CatalogGroup label="Products" items={products} manage={manage} />
              <CatalogGroup label="Services" items={services} manage={manage} />
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon="tag"
          title="The catalogue is empty"
          sub={
            manage
              ? "Add the products and services you bill for — then bundle them into kits."
              : "An admin adds products and services here."
          }
        />
      )}
    </>
  );
}

function KitCard({ kit, index, manage }: { kit: Kit; index: number; manage: boolean }) {
  const { ws, openModal } = useWorkspace();
  const n = kit.items.length;
  return (
    <div
      className={`menu-card kit-card ${manage ? "" : "static"}`.trim()}
      style={{ "--i": index } as React.CSSProperties}
      onClick={manage ? () => openModal(<KitForm kit={kit} />) : undefined}
      role={manage ? "button" : undefined}
    >
      <div className="mc-head">
        <span className="mc-icon">
          <Icon name="box" />
        </span>
        <div className="mc-title">
          <span className="mc-name">{kit.name}</span>
          <span className="mc-count">
            {n} item{n === 1 ? "" : "s"}
          </span>
        </div>
        {manage && (
          <span className="mc-edit">
            <Icon name="edit" />
          </span>
        )}
      </div>
      {kit.description && <p className="kit-desc">{kit.description}</p>}
      <ul className="kit-lines">
        {kit.items.map((it, i) => {
          const item = ws.catalog.find((c) => c.id === it.catalogItemId);
          if (!item) {
            return (
              <li key={i} className="gone">
                <span className="kl-name">Item no longer in the catalogue</span>
              </li>
            );
          }
          return (
            <li key={i}>
              <span className="kl-name">
                {item.name} <span className="kl-qty">× {it.qty}</span>
              </span>
              <span className="kl-amt">{fmtMoney(lineAmount(catalogLine(item, it.qty)))}</span>
            </li>
          );
        })}
        {!n && (
          <li className="gone">
            <span className="kl-name">Nothing in this kit.</span>
          </li>
        )}
      </ul>
      <div className="kit-total">
        <span>Kit total, before HST</span>
        <b>{fmtMoney(kitTotal(kit, ws.catalog))}</b>
      </div>
    </div>
  );
}

function CatalogGroup({
  label,
  items,
  manage,
}: {
  label: string;
  items: CatalogItem[];
  manage: boolean;
}) {
  const { openModal } = useWorkspace();
  const cols = manage ? 5 : 4;
  return (
    <>
      <tr className="fin-group">
        <td colSpan={cols}>
          {label} <span className="fin-group-count">· {items.length}</span>
        </td>
      </tr>
      {items.length ? (
        items.map((c) => (
          <tr key={c.id} className={c.active ? "" : "inactive"}>
            <td>
              <strong>{c.name}</strong>
              {c.description && <span className="fin-sub">{c.description}</span>}
            </td>
            <td>{c.unit || "each"}</td>
            <td className="num fin-total">{fmtMoney(c.unitPrice)}</td>
            <td>
              <span className={`pill ${c.active ? "approved" : "neutral"}`}>
                {c.active ? "Active" : "Inactive"}
              </span>
            </td>
            {manage && (
              <td className="fin-actions-cell">
                <button
                  className="icon-btn"
                  aria-label={`Edit ${c.name}`}
                  title="Edit"
                  onClick={() => openModal(<CatalogItemForm item={c} />)}
                >
                  <Icon name="edit" />
                </button>
              </td>
            )}
          </tr>
        ))
      ) : (
        <tr className="fin-muted">
          <td colSpan={cols}>No {label.toLowerCase()} yet.</td>
        </tr>
      )}
    </>
  );
}
