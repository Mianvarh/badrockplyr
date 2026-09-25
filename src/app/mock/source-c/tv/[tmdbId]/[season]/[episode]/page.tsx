import React from "react";

interface PageProps {
  params: Promise<{
    tmdbId: string;
    season: string;
    episode: string;
  }>;
}

export default async function SourceCTVMock({ params }: PageProps) {
  const { tmdbId, season, episode } = await params;

  const jsonData = {
    tmdbId: tmdbId,
    title: `TV Series Mock ${tmdbId}`,
    season: Number(season),
    episode: Number(episode),
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
        <title>Source C - TV {tmdbId} S{season}E{episode}</title>
      </head>
      <body style={{ background: "#111", color: "#eee", fontFamily: "monospace", padding: "2rem" }}>
        <div style={{ maxWidth: "600px", margin: "0 auto" }}>
          <h2>Mock Page C (TV JSON Mode)</h2>
          <script
            type="application/json"
            id="badrockplyr-data"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonData, null, 2) }}
          />
          <pre>{JSON.stringify(jsonData, null, 2)}</pre>
        </div>
      </body>
    </html>
  );
}
