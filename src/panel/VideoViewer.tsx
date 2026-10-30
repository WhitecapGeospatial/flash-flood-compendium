import { useState } from "react";

type Video = { url: string; embed: string | null; thumb: string | null; label: string };

/** Maps a video page URL to an embeddable player URL where the host allows one. */
function toVideo(url: string): Video {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.slice(1);
  else if (host === "youtube.com") yt = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null;
  if (yt)
    return {
      url,
      embed: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`,
      thumb: `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`,
      label: "YouTube",
    };
  if (host === "facebook.com" || host === "fb.watch")
    return { url, embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`, thumb: null, label: "Facebook" };
  return { url, embed: null, thumb: null, label: host };
}

export function VideoViewer({ urls }: { urls: string[] }) {
  const videos = urls.flatMap((u) => {
    try {
      return [toVideo(u)];
    } catch {
      return [];
    }
  });
  const playable = videos.filter((v) => v.embed);
  const [active, setActive] = useState(0);
  const current = playable[Math.min(active, playable.length - 1)];
  const external = videos.filter((v) => !v.embed);

  return (
    <div className="flex flex-col gap-3">
      {current && (
        <div className="overflow-hidden rounded-md border border-ds-border bg-black">
          <iframe
            key={current.embed}
            src={current.embed!}
            title="Flood video"
            className="aspect-video w-full"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {playable.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {playable.map((v, i) => (
            <button
              key={v.url}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={v === current}
              aria-label={`Play video ${i + 1}`}
              className={`relative h-14 w-24 shrink-0 overflow-hidden rounded-sm border-2 bg-ds-surface-raised text-xs ${v === current ? "border-ds-accent" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              {v.thumb ? <img src={v.thumb} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span>{v.label}</span>}
            </button>
          ))}
        </div>
      )}
      {external.map((v) => (
        <a key={v.url} href={v.url} target="_blank" rel="noreferrer" className="link-row">
          <span>Video on {v.label}</span>
          <span aria-hidden>↗</span>
        </a>
      ))}
    </div>
  );
}
