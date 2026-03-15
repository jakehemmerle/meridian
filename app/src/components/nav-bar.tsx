"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/history", label: "History" },
] as const;

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="nav-bar" data-testid="nav-bar">
      <Link href="/" className="nav-brand">
        Meridian
      </Link>
      <ul className="nav-links">
        {NAV_ITEMS.map(({ href, label }) => {
          const isActive =
            href === "/"
              ? pathname === "/" || pathname.startsWith("/trade/")
              : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={isActive ? "nav-link active" : "nav-link"}
                aria-current={isActive ? "page" : undefined}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
