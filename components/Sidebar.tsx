"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  Trophy,
  Upload,
  StickyNote,
  MessageSquare,
  Clock,
  BookMarked,
  Share2,
  Lightbulb,
  FileText,
  BarChart3,
  Shield,
  type LucideIcon,
} from "lucide-react";

const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/profile", label: "My Profile", icon: User },
      { href: "/dashboard/contribution", label: "Contribution", icon: Trophy },
    ],
  },
  {
    label: "Capture",
    items: [
      { href: "/dashboard/upload", label: "Documents", icon: Upload },
      { href: "/dashboard/notes", label: "Notes", icon: StickyNote },
      { href: "/dashboard/papers", label: "Research Papers", icon: FileText },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/dashboard/chat", label: "AI Workspace", icon: MessageSquare },
      { href: "/dashboard/timeline", label: "Timeline", icon: Clock },
      { href: "/dashboard/decisions", label: "Decision Memory", icon: BookMarked },
      { href: "/dashboard/graph", label: "Knowledge Graph", icon: Share2 },
      { href: "/dashboard/strategy", label: "Strategy Advisor", icon: Lightbulb },
    ],
  },
  {
    label: "Company",
    items: [
      { href: "/dashboard/insights", label: "Insights", icon: BarChart3 },
      { href: "/dashboard/admin", label: "Admin & Access", icon: Shield },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-60 shrink-0 border-r border-border bg-panel h-screen sticky top-0 overflow-y-auto py-6 px-3">
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
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "flex items-center gap-2.5 px-3 py-1.5 text-sm rounded transition-colors " +
                    (active
                      ? "bg-panel-raised text-brass-bright"
                      : "text-paper/80 hover:bg-panel-raised hover:text-paper")
                  }
                >
                  <Icon size={15} strokeWidth={2} className="shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
