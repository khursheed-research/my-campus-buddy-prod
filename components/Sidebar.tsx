"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/profile", label: "My Profile" },
    ],
  },
  {
    label: "Capture",
    items: [
      { href: "/dashboard/upload", label: "Documents" },
      { href: "/dashboard/notes", label: "Notes" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/dashboard/chat", label: "AI Workspace" },
      { href: "/dashboard/timeline", label: "Timeline" },
      { href: "/dashboard/decisions", label: "Decision Memory" },
      { href: "/dashboard/graph", label: "Knowledge Graph" },
      { href: "/dashboard/strategy", label: "Strategy Advisor" },
    ],
  },
  {
    label: "Company",
    items: [
      { href: "/dashboard/insights", label: "Insights" },
      { href: "/dashboard/contribution", label: "Contribution" },
      { href: "/dashboard/admin", label: "Admin & Access" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 border-r border-border bg-panel h-screen sticky top-0 overflow-y-auto py-6 px-3">
      <Link href="/dashboard" className="block px-3 mb-8">
        <span className="font-display text-lg text-paper tracking-tight">My Campus Buddy</span>
      </Link>

      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-6">
          <p className="px-3 text-[11px] font-medium text-muted mb-2 tracking-wide">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "block px-3 py-1.5 text-sm rounded transition-colors " +
                    (active
                      ? "bg-panel-raised text-brass-bright"
                      : "text-paper/80 hover:bg-panel-raised hover:text-paper")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
