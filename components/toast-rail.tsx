"use client";

import { useWorkspace } from "./workspace-provider";
import { Icon } from "./icons";

export function ToastRail() {
  const { toasts } = useWorkspace();
  return (
    <div className="toast-rail">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.leaving ? "out" : ""}`.trim()}>
          <Icon name={t.icon} />
          {t.text}
        </div>
      ))}
    </div>
  );
}
