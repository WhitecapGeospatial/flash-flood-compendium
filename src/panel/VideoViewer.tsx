import { useEffect, useRef, useState } from "react";
import { loadYouTubeApi, YT_BLOCKED_CODES } from "./youtube";

type Video = { url: string; youtubeId: string | null; embed: string | null; thumb: string | null; label: string };

/** Maps a video page URL to a player where the host allows one. */
function toVideo(url: string): Video {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let yt: string | null = null;
  if (host === "youtu.be") yt = u.pathname.slice(1);
  else if (host === "youtube.com") yt = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null;
  if (yt) return { url, youtubeId: yt, embed: null, thumb: `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`, label: "YouTube" };
  if (host === "facebook.com" || host === "fb.watch")
    return { url, youtubeId: null, embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`, thumb: null, label: "Facebook" };
  return { url, youtubeId: null, embed: null, thumb: null, label: host };
}

/** YouTube player that reports owner/availability blocks instead of showing YouTube's error screen. */
function YouTubePlayer({ id, onBlocked }: { id: string; onBlocked: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;

  useEffect(() => {
    let player: { destroy(): void } | null = null;
    let cancelled = false;
    loadYouTubeApi().then(
      (YT) => {
        if (cancelled || !host.current) return;
        const el = document.createElement("div");
        host.current.replaceChildren(el);
        player = new YT.Player(el, {
          host: "https://www.youtube-nocookie.com",
          videoId: id,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1 },
          events: { onError: (e) => YT_BLOCKED_CODES.has(e.data) && blocked.current() },
        });
      },
      () => !cancelled && blocked.current(),
    );
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [id]);

  return <div ref={host} className="aspect-video w-full [&>iframe]:h-full [&>iframe]:w-full" />;
}

export function VideoViewer({ urls }: { urls: string[] }) {
  const videos = urls.flatMap((u) => {
    try {
      return [toVideo(u)];
    } catch {
      return [];
    }
  });
  const playable = videos.filter((v) => v.youtubeId || v.embed);
  const external = videos.filter((v) => !v.youtubeId && !v.embed);
  const [active, setActive] = useState(0);
  // YouTube videos whose owner blocks playback outside youtube.com.
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());
  const current = playable[Math.min(active, playable.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      {current && (
        <div className="overflow-hidden rounded-md border border-ds-border bg-black">
          {blocked.has(current.url) ? (
            <a href={current.url} target="_blank" rel="noreferrer" className="video-blocked">
              {current.thumb && <img src={current.thumb} alt="" loading="lazy" />}
              <span className="video-blocked-label">
                <strong>Watch on YouTube ↗</strong>
                <span>The video owner does not allow playback on other sites.</span>
              </span>
            </a>
          ) : current.youtubeId ? (
            <YouTubePlayer key={current.url} id={current.youtubeId} onBlocked={() => setBlocked((s) => new Set(s).add(current.url))} />
          ) : (
            <iframe
              key={current.embed}
              src={current.embed!}
              title="Flood video"
              className="aspect-video w-full"
              allow="encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
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
              aria-label={`Video ${i + 1}${blocked.has(v.url) ? " (opens on YouTube)" : ""}`}
              className={`relative h-14 w-24 shrink-0 overflow-hidden rounded-sm border-2 bg-ds-surface-raised text-xs ${v === current ? "border-ds-accent" : "border-transparent opacity-70 hover:opacity-100"}`}
            >
              {v.thumb ? <img src={v.thumb} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span>{v.label}</span>}
              {blocked.has(v.url) && <span className="video-thumb-badge">↗</span>}
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
