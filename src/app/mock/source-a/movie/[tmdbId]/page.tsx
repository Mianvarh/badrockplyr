import React from "react";

interface PageProps {
  params: Promise<{ tmdbId: string }>;
}

export default async function SourceAMovieMock({ params }: PageProps) {
  const { tmdbId } = await params;

  return (
    <html lang="es">
      <head>
        <title>Source A - Movie {tmdbId}</title>
        <meta name="tmdb-id" content={tmdbId} />
      </head>
      <body style={{ background: "#000", color: "#fff", fontFamily: "sans-serif", padding: "2rem" }}>
        {/* Fake Popup overlay to test popup bypassing */}
        <div
          id="fake-ad-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0, 0, 0, 0.95)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <h1 style={{ color: "#ef4444" }}>¡ADVERTENCIA DE VIRUS! (Publicidad Simulada)</h1>
          <p>Haz clic en este popup molesto para descargar malware.</p>
          <button style={{ padding: "0.5rem 1rem", background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}>
            Aceptar / Cerrar
          </button>
        </div>

        {/* Video container */}
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2>Reproductor de Película - Source A</h2>
          <p>TMDB ID: {tmdbId} | Idioma: Latino | Calidad: CAM</p>
          
          <video
            data-tmdb-id={tmdbId}
            data-quality="CAM"
            data-language="Latino"
            controls
            style={{ width: "100%", borderRadius: "8px" }}
          >
            <source src="https://cuevana3.cl/videos/demo-cam.mp4" type="video/mp4" />
            Tu navegador no soporta video HTML5.
          </video>
        </div>
      </body>
    </html>
  );
}
