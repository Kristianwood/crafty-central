import { statusLabel } from "@/lib/format";

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`pill ${status}`}>
      <span className="pip" />
      {statusLabel(status)}
    </span>
  );
}
