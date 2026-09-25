import React from "react";

interface PageProps {
  params: Promise<{ tmdbId: string }>;
}

export default async function SourceBMovieMock({ params }: PageProps) {
  const { tmdbId } = await params;

  return (
    <html lang="es">
      <head>
        <title>Source B - Movie {tmdbId}</title>
      </head>
      <body style={{ background: "#0b0f19", color: "#f3f4f6", fontFamily: "sans-serif", padding: "2rem" }}>
        {/* Ad popup overlay */}
        <div
          className="interstitial-ad"
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            padding: "1rem",
            background: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "8px",
            zIndex: 50
          }}
        >
          <span style={{ fontSize: "11px", color: "#9ca3af" }}>Anuncio Patrocinado</span>
          <p style={{ margin: "5px 0 0 0" }}>Gana $5000 al día haciendo clic aquí</p>
        </div>

        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2>Reproductor Premium - Source B</h2>
          
          {/* Data attribute identifier */}
          <div data-tmdb-id={tmdbId} style={{ display: "none" }}></div>

          <video
            data-tmdb-id={tmdbId}
            data-quality="HD"
            data-language="Latino"
            controls
            style={{ width: "100%", borderRadius: "8px", border: "2px solid #10b981" }}
          >
            <source src="https://cuevana3.cl/videos/demo-hd.mp4" type="video/mp4" />
          </video>
        </div>
      </body>
    </html>
  );
}
