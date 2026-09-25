import React from "react";

interface PageProps {
  params: Promise<{
    tmdbId: string;
    season: string;
    episode: string;
  }>;
}

export default async function SourceBTVMock({ params }: PageProps) {
  const { tmdbId, season, episode } = await params;

  return (
    <html lang="es">
      <head>
        <title>Source B - TV {tmdbId} S{season}E{episode}</title>
      </head>
      <body style={{ background: "#0b0f19", color: "#f3f4f6", fontFamily: "sans-serif", padding: "2rem" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2>TV Serie Premium - Source B</h2>
          <div data-tmdb-id={tmdbId} style={{ display: "none" }}></div>

          <video
            data-tmdb-id={tmdbId}
            data-quality="HD"
            data-language="Latino"
            controls
            style={{ width: "100%", borderRadius: "8px" }}
          >
            <source src="https://cuevana3.cl/videos/demo-hd.mp4" type="video/mp4" />
          </video>
        </div>
      </body>
    </html>
  );
}
