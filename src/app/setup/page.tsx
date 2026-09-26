"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import BadrockLogo from "@/components/BadrockLogo";
import {
  runSetupDiagnostics,
  SetupDiagnosticsReport,
  SystemCheckItem,
} from "./actions";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  RefreshCw,
  ArrowRight,
  Database,
  Cpu,
  Key,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  Terminal,
  Server,
  Layers,
  Check,
} from "lucide-react";

export default function SetupPage() {
  const [report, setReport] = useState<SetupDiagnosticsReport | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const fetchDiagnostics = () => {
    startTransition(async () => {
      try {
        const res = await runSetupDiagnostics();
        setReport(res);
      } catch (err) {
        console.error("Error running setup diagnostics:", err);
      } finally {
        setIsInitialLoading(false);
      }
    });
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const getStatusBadge = (status: SystemCheckItem["status"], text: string) => {
    switch (status) {
      case "ok":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {text}
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-950/60 border border-amber-500/30 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            {text}
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-950/60 border border-rose-500/30 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.15)]">
            <XCircle className="h-3 w-3 text-rose-400" />
            {text}
          </span>
        );
      case "info":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
            <Info className="h-3 w-3 text-cyan-400" />
            {text}
          </span>
        );
    }
  };

  const getCheckIcon = (id: string, status: SystemCheckItem["status"]) => {
    const iconClass =
      status === "ok"
        ? "text-emerald-400"
        : status === "warning"
        ? "text-amber-400"
        : status === "error"
        ? "text-rose-400"
        : "text-cyan-400";

    switch (id) {
      case "node":
        return <Cpu className={`h-5 w-5 ${iconClass}`} />;
      case "database":
        return <Database className={`h-5 w-5 ${iconClass}`} />;
      case "tmdb":
        return <Key className={`h-5 w-5 ${iconClass}`} />;
      case "proxy":
        return <ShieldCheck className={`h-5 w-5 ${iconClass}`} />;
      default:
        return <Server className={`h-5 w-5 ${iconClass}`} />;
    }
  };

  const checks = report ? [
    report.checks.node,
    report.checks.database,
    report.checks.tmdb,
    report.checks.proxy,
  ] : [];

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-hidden">
      {/* Background ambient decorative glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-1/3 w-[600px] h-96 bg-purple-600/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Navbar */}
      <header className="border-b border-white/[0.06] bg-[#090b12]/80 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-18 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <BadrockLogo size="md" />
          </Link>

          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
              <Sparkles className="h-3 w-3 text-cyan-400" />
              Installation Checker v2.0
            </span>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-cyan-500/30 text-zinc-300 hover:text-white transition-all duration-200"
            >
              Dashboard
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* Hero Section */}
        <div className="relative rounded-3xl p-8 sm:p-10 bg-gradient-to-br from-[#0c101c] via-[#090d18] to-[#07090e] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-cyan-500/10 to-transparent pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                Asistente de Configuración & Diagnóstico
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-100 to-zinc-400 bg-clip-text text-transparent">
                Verificador de Instalación Badrockplyr PRO
              </h1>

              <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                Comprueba en tiempo real el entorno Node.js, la conectividad con la base de datos (Prisma),
                la presencia de credenciales TMDb y el estado del pool de proxies Webshare para garantizar un despliegue sin fallas.
              </p>
            </div>

            {/* Overall Score Card & Action */}
            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-4 min-w-[260px]">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] w-full text-center lg:text-right">
                <p className="text-xs font-medium text-zinc-400">Estado General del Sistema</p>
                <div className="mt-2 flex items-center justify-center lg:justify-end gap-3">
                  <span className="text-3xl font-extrabold font-mono tracking-tight text-white">
                    {report ? `${report.score.passed}/${report.score.total}` : "—"}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                    report?.allOk
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  }`}>
                    {report?.allOk ? "Listo para Uso" : "Atención Requerida"}
                  </span>
                </div>
                <div className="w-full bg-zinc-800/80 rounded-full h-2 mt-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500 rounded-full"
                    style={{ width: `${report ? report.score.percent : 0}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={fetchDiagnostics}
                  disabled={isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.1] text-zinc-200 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                  title="Volver a verificar el sistema"
                >
                  <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin text-cyan-400" : "text-zinc-400"}`} />
                  Re-verificar
                </button>

                <Link
                  href="/dashboard"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 text-xs font-bold shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all cursor-pointer"
                >
                  Ir al Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Loading State Skeleton */}
        {isInitialLoading && !report && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-56 rounded-2xl bg-zinc-900/40 border border-white/[0.05] animate-pulse p-6"
              />
            ))}
          </div>
        )}

        {/* 4 Diagnostics Cards */}
        {report && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {checks.map((check) => (
              <div
                key={check.id}
                className="rounded-2xl bg-[#0b0e17]/90 border border-white/[0.07] hover:border-white/[0.12] transition-all p-6 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.3)] group relative overflow-hidden"
              >
                {/* Glow accent */}
                <div
                  className={`absolute top-0 left-0 w-full h-[2px] ${
                    check.status === "ok"
                      ? "bg-gradient-to-r from-emerald-500/80 via-emerald-400/40 to-transparent"
                      : check.status === "warning"
                      ? "bg-gradient-to-r from-amber-500/80 via-amber-400/40 to-transparent"
                      : check.status === "error"
                      ? "bg-gradient-to-r from-rose-500/80 via-rose-400/40 to-transparent"
                      : "bg-gradient-to-r from-cyan-500/80 via-cyan-400/40 to-transparent"
                  }`}
                />

                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center group-hover:scale-105 transition-transform">
                        {getCheckIcon(check.id, check.status)}
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-zinc-100">{check.title}</h2>
                        <p className="text-xs text-zinc-400 mt-0.5">{check.description}</p>
                      </div>
                    </div>

                    <div>{getStatusBadge(check.status, check.badge)}</div>
                  </div>

                  {/* Details Grid */}
                  <div className="mt-5 grid grid-cols-2 gap-2.5 p-3.5 rounded-xl bg-black/30 border border-white/[0.04]">
                    {check.details.map((detail, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="text-zinc-500 block text-[11px] font-medium">{detail.label}</span>
                        <span
                          className={`font-mono font-semibold truncate block mt-0.5 ${
                            detail.isHighlight
                              ? check.status === "ok"
                                ? "text-emerald-300"
                                : check.status === "warning"
                                ? "text-amber-300"
                                : check.status === "error"
                                ? "text-rose-300"
                                : "text-cyan-300"
                              : "text-zinc-300"
                          }`}
                        >
                          {detail.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Message */}
                  {check.message && (
                    <div className="mt-4 flex items-start gap-2 text-xs text-zinc-300">
                      {check.status === "ok" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      )}
                      <span>{check.message}</span>
                    </div>
                  )}

                  {/* Recommendation Box if any */}
                  {check.recommendation && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 text-amber-200/90 text-xs">
                      <span className="font-semibold text-amber-300 block mb-1">Recomendación:</span>
                      {check.recommendation}
                    </div>
                  )}
                </div>

                {/* Footer action link if needed */}
                <div className="mt-5 pt-3.5 border-t border-white/[0.05] flex items-center justify-between text-xs">
                  {check.id === "proxy" && (
                    <Link
                      href="/dashboard/settings"
                      className="text-cyan-400 hover:text-cyan-300 font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      Gestionar Cuentas Webshare
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  {check.id === "database" && (
                    <Link
                      href="/dashboard/movies"
                      className="text-cyan-400 hover:text-cyan-300 font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      Explorar Catálogo en DB
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  {check.id === "node" && (
                    <span className="text-zinc-500 text-[11px] font-mono">
                      Arquitectura {process.arch} / PID {process.pid}
                    </span>
                  )}
                  {check.id === "tmdb" && (
                    <a
                      href="https://www.themoviedb.org/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      Portal de TMDb API
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Instructions & Deployment Card */}
        <div className="rounded-2xl p-6 bg-white/[0.02] border border-white/[0.06] space-y-4">
          <div className="flex items-center gap-2.5">
            <Terminal className="h-5 w-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-zinc-200">Guía de Inicio Rápido para Producción</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-black/25 border border-white/[0.04]">
              <span className="text-cyan-400 font-bold block mb-1">1. Variables de Entorno</span>
              <p className="text-zinc-400 leading-relaxed">
                Copia <code className="text-zinc-300 font-mono">.env.example</code> a <code className="text-zinc-300 font-mono">.env</code> y define tu <code className="text-cyan-300 font-mono">TMDB_API_KEY</code> y <code className="text-cyan-300 font-mono">DATABASE_URL</code>.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/25 border border-white/[0.04]">
              <span className="text-emerald-400 font-bold block mb-1">2. Migración a Postgres</span>
              <p className="text-zinc-400 leading-relaxed">
                Para servidores de alto tráfico, ejecuta <code className="text-emerald-300 font-mono">npm run db:migrate-data</code> para migrar tu <code className="text-zinc-300 font-mono">dev.db</code> a PostgreSQL.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/25 border border-white/[0.04]">
              <span className="text-purple-400 font-bold block mb-1">3. Conexión WordPress</span>
              <p className="text-zinc-400 leading-relaxed">
                Instala el <code className="text-purple-300 font-mono">badrock-child-theme.zip</code> o aplica los presets de DooPlay/ToroFlix incluidos en el paquete.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom CTA Banner */}
        <div className="rounded-2xl p-6 bg-gradient-to-r from-cyan-950/30 via-[#0b0e17] to-emerald-950/30 border border-cyan-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-100">¿Todo listo? Comienza a generar URLs</p>
              <p className="text-xs text-zinc-400">Accede directamente al panel para crear tus primeros reproductores embed.</p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all shrink-0 cursor-pointer"
          >
            Continuar al Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
