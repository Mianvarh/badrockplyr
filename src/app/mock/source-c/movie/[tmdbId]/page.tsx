import React from "react";

interface PageProps {
  params: Promise<{ tmdbId: string }>;
}

export default async function SourceCMovieMock({ params }: PageProps) {
  const { tmdbId } = await params;

  // Render a page containing a custom JSON script tag containing English 1080p video with subtitles
  const jsonData = {
    tmdbId: tmdbId,
    title: `Superman Mock ${tmdbId}`,
    year: "2025",
    videos: [
      {
        url: "https://cuevana3.cl/videos/demo-en-1080p.mp4",
        quality: "1080p",
        language: "english"
      }
    ],
    subtitles: [
      {
        url: "https://cuevana3.cl/subs/es.vtt",
        language: "latino",
        format: "vtt"
      }
    ]
  };

  return (
    <html lang="en">
      <head>
        <title>Source C - Movie {tmdbId}</title>
      </head>
      <body style={{ background: "#111", color: "#eee", fontFamily: "monospace", padding: "2rem" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2>Mock Page C (JSON Data Mode)</h2>
          <p>This page serves raw player configuration inside a script tag.</p>

          <script
            type="application/json"
            id="badrockplyr-data"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonData, null, 2) }}
          />

          <div style={{ padding: "1rem", background: "#222", border: "1px solid #333", borderRadius: "5px" }}>
            <span style={{ color: "#10b981" }}>Parsed config script element present:</span>
            <pre style={{ fontSize: "11px", marginTop: "10px", overflowX: "auto" }}>
              {JSON.stringify(jsonData, null, 2)}
            </pre>
          </div>
        </div>
      </body>
    </html>
  );
}
