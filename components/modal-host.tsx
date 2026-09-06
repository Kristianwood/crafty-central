"use client";

/* One modal at a time, closed by the scrim, Escape, or whatever
   put it there. Views hand it a node rather than an HTML string. */

import { useEffect } from "react";
import { useWorkspace } from "./workspace-provider";

export function ModalHost() {
  const { modal, closeModal } = useWorkspace();

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal, closeModal]);

  if (!modal) return null;

  return (
    <div
      className="modal-scrim open"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        {modal}
      </div>
    </div>
  );
}
