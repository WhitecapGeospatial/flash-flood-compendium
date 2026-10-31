/**
 * Minimal loader and types for the YouTube IFrame Player API
 * (https://developers.google.com/youtube/iframe_api_reference).
 *
 * A plain <iframe> cannot tell the app that a video failed: rights holders
 * (e.g. AFP) can block playback on third-party sites even when the video is
 * public, and YouTube then shows "Video unavailable" inside the frame. The API
 * reports that as an onError code, so the viewer can link out instead.
 */
export type YTPlayer = { destroy(): void };
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: { onError?: (e: { data: number }) => void; onReady?: () => void };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** onError codes: 2 bad id, 5 HTML5 error, 100 removed/private, 101 and 150 embedding blocked by the owner. */
export const YT_BLOCKED_CODES = new Set([100, 101, 150]);

let api: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (api) return api;
  if (window.YT?.Player) return (api = Promise.resolve(window.YT));
  const { promise, resolve, reject } = Promise.withResolvers<YTNamespace>();
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    prev?.();
    resolve(window.YT!);
  };
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  s.async = true;
  s.onerror = () => {
    api = null;
    reject(new Error("YouTube player failed to load"));
  };
  document.head.appendChild(s);
  return (api = promise);
}
