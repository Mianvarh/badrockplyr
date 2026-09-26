"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Link2,
  ListVideo,
  Film,
  Server,
  Activity,
  Settings,
  Clock,
  Terminal,
  Database,
  HardDrive,
  Key
} from "lucide-react";

interface SidebarLink {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const sidebarLinks: SidebarLink[] = [
  { name: "Resumen", href: "/dashboard", icon: LayoutDashboard },
  { name: "Generador de URL", href: "/dashboard/generator", icon: Link2 },
  { name: "URLs Generadas", href: "/dashboard/generated-links", icon: ListVideo },
  { name: "Biblioteca Media", href: "/dashboard/movies", icon: Film },
  { name: "Fuentes Propias", href: "/dashboard/private-media", icon: HardDrive },
  { name: "Fuentes Scraper", href: "/dashboard/sources", icon: Server },
  { name: "API Keys", href: "/dashboard/api-keys", icon: Key },
  { name: "Resultados", href: "/dashboard/results", icon: Activity },
  { name: "Tareas / Jobs", href: "/dashboard/jobs", icon: Clock },
  { name: "Configuración", href: "/dashboard/settings", icon: Settings },
];

import BadrockLogo from "@/components/BadrockLogo";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#07090e] text-zinc-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Sidebar */}
      <aside className="w-64 border-r border-white/[0.06] bg-[#0b0e17]/80 backdrop-blur-2xl flex flex-col fixed inset-y-0 left-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.4)]">
        {/* Brand / Logo */}
        <div className="h-16 flex items-center px-5 border-b border-white/[0.06]">
          <Link href="/dashboard" className="hover:opacity-90 transition-opacity">
            <BadrockLogo size="md" />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          <div className="px-3 mb-2.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            Consola de Control
          </div>
          {sidebarLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent text-cyan-300 border-l-2 border-cyan-400 font-semibold shadow-[0_0_20px_rgba(6,182,212,0.1)]"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04] border-l-2 border-transparent"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-cyan-400" : "text-zinc-400"}`} />
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-3.5 border-t border-white/[0.06] bg-black/20">
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-400" />
              <div className="text-[11px] leading-tight">
                <p className="font-semibold text-zinc-200">Database</p>
                <p className="text-[10px] text-zinc-400 font-mono">SQLite (Prisma)</p>
              </div>
            </div>
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="pl-64 flex flex-col flex-1 min-w-0">
        {/* Top Navbar */}
        <header className="h-16 border-b border-white/[0.06] bg-[#090b12]/60 backdrop-blur-xl sticky top-0 z-10 flex items-center justify-between px-8">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono font-bold text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 px-2.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.15)]">
              v2.0 Commercial Pro
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Status indicator */}
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-950/30 border border-emerald-500/30 px-3 py-1 rounded-full shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Servidor Activo
            </div>
          </div>
        </header>

        {/* Page children */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
