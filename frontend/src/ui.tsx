import { AlertCircle, ArrowUpRight, ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";

export function Brand({ chat = false }: { chat?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        s.
      </span>
      <div>
        <span className="brand-name">senja tas</span>
        <span className="brand-sub">
          {chat ? "ASISTEN BELANJA" : "OWNER WORKSPACE"}
        </span>
      </div>
    </div>
  );
}
export function Empty({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon || <ShoppingBag />}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function ErrorNotice({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={19} />
      <div>{children}</div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function More({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="text-link" href={href}>
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
export function Stat({
  label,
  value,
  caption,
  icon,
}: {
  label: string;
  value: ReactNode;
  caption: string;
  icon: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <p>{caption}</p>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        (["selesai", "dikirim"].includes(value.toLowerCase()) ? "green" : "")
      }
    >
      {value}
    </span>
  );
}
