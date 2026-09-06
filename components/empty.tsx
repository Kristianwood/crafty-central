import { Icon } from "./icons";

/** The "nothing here" block, same markup app.css already styles. */
export function Empty({
  icon = "truck",
  title,
  sub,
  style,
}: {
  icon?: string;
  title: string;
  sub?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className="empty" style={style}>
      <Icon name={icon} />
      <div className="e-title">{title}</div>
      {sub && <div className="e-sub">{sub}</div>}
    </div>
  );
}
