import React from "react";

interface PageProps {
  params: Promise<{
    tmdbId: string;
    season: string;
    episode: string;
  }>;
}

export default async function SourceATVMock({ params }: PageProps) {
  const { tmdbId, season, episode } = await params;

  return (
    <html lang="es">
      <head>
        <title>Source A - TV {tmdbId} S{season}E{episode}</title>
        <meta name="tmdb-id" content={tmdbId} />
      </head>
      <body style={{ background: "#000", color: "#fff", fontFamily: "sans-serif", padding: "2rem" }}>
        <div id="fake-ad-overlay" style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.9)", zIndex: 9999 }}>
          <div style={{ textAlign: "center", marginTop: "20%" }}>
            <h2>Publicidad Simulada</h2>
            <button>Cerrar X</button>
          </div>
        </div>

        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2>TV Serie - Source A</h2>
          <p>TMDB: {tmdbId} | Temporada: {season} | Episodio: {episode} | Idioma: Latino | Calidad: CAM</p>
          
          <video
            data-tmdb-id={tmdbId}
            data-quality="CAM"
            data-language="Latino"
            controls
            style={{ width: "100%" }}
          >
            <source src="https://cuevana3.cl/videos/demo-cam.mp4" type="video/mp4" />
          </video>
        </div>
      </body>
    </html>
  );
}
