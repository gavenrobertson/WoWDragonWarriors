"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <nav aria-label="Main" className="main-nav">
      {items.map((n) => (
        <Link key={n.href} href={n.href} className="nav-link" aria-current={active(n.href) ? "page" : undefined}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
