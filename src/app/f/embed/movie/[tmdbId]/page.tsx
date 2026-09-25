import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { triggerSearchSimulation } from "@/app/actions/generatorActions";
import { isCleanPlaybackUrl } from "@/lib/playbackUrlPolicy";

interface PageProps {
  params: Promise<{ tmdbId: string }>;
}

export const revalidate = 0;

export default async function MovieCollectorPage({ params }: PageProps) {
  const { tmdbId } = await params;
  const link = await prisma.generatedLink.findFirst({
    where: { tmdbId, type: "movie" },
    include: {
      mediaItem: {
        include: {
          videoVariants: { where: { status: "ONLINE" } },
        },
      },
    },
  });

  if (!link) {
    return (
      <CollectorShell title="Contenido no indexado">
        <p>No existe un enlace generado para TMDB ID {tmdbId}.</p>
      </CollectorShell>
    );
  }

  const cleanVariants = link.mediaItem.videoVariants.filter((variant) => isCleanPlaybackUrl(variant.videoUrl));
  let message = "Este contenido ya tiene fuentes disponibles.";
  if (cleanVariants.length === 0) {
    const result = await triggerSearchSimulation(link.id);
    message = result.message || result.error || "Se solicitó la búsqueda de fuentes.";
  }

  return (
    <CollectorShell title={link.mediaItem.title}>
      <p>{message}</p>
      <Link href={`/play/embed/movie/${tmdbId}`} className="text-cyan-400 hover:text-cyan-300 underline">
        Abrir reproductor
      </Link>
    </CollectorShell>
  );
}

function CollectorShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-6">
      <section className="max-w-md w-full rounded-lg border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="text-sm text-zinc-400 space-y-3">{children}</div>
      </section>
    </main>
  );
}
