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
  HardDrive
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
  { name: "Resultados", href: "/dashboard/results", icon: Activity },
  { name: "Tareas / Jobs", href: "/dashboard/jobs", icon: Clock },
  { name: "Configuración", href: "/dashboard/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-50 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-900/60 backdrop-blur-md flex flex-col fixed inset-y-0 left-0 z-20">
        {/* Brand / Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-zinc-800">
          <Terminal className="h-6 w-6 text-cyan-400" />
          <span className="text-lg font-bold tracking-wider bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            BADROCKPLYR
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          <div className="px-3 mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Consola de Control
          </div>
          {sidebarLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-cyan-950/40 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_-3px_rgba(6,182,212,0.15)]"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${isActive ? "text-cyan-400" : "text-zinc-400 group-hover:text-zinc-200"}`} />
                {link.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/40">
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md bg-zinc-950/60 border border-zinc-800/80">
            <Database className="h-4 w-4 text-emerald-500" />
            <div className="text-[11px] leading-tight">
              <p className="font-semibold text-zinc-300">SQLite DB</p>
              <p className="text-zinc-500 font-mono">active_dev_local</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="pl-64 flex flex-col flex-1 min-w-0">
        {/* Top Navbar */}
        <header className="h-16 border-b border-zinc-800 bg-zinc-900/20 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between px-8">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-500 bg-zinc-800/50 border border-zinc-800 px-2 py-0.5 rounded">
              v1.0.0
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Status indicator */}
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400 bg-emerald-950/20 border border-emerald-500/20 px-2.5 py-1 rounded-full shadow-[0_0_10px_-2px_rgba(16,185,129,0.1)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
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
