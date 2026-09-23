import { useState } from "react";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";

export interface MediaSlide {
  type: "image" | "video";
  url: string;
}

// Combines a listing's photos and videos into one ordered slide list — used
// everywhere a listing's media shows, so the two are always browsed together
// as a single sliding carousel instead of a photo strip plus a separate
// video section.
export function buildMediaSlides(imageUrls?: string[] | null, videoUrls?: string[] | null): MediaSlide[] {
  return [
    ...(imageUrls ?? []).map((url) => ({ type: "image" as const, url })),
    ...(videoUrls ?? []).map((url) => ({ type: "video" as const, url })),
  ];
}

// `videoControls=false` (the default, used for compact contexts like a
// Market card) shows a video slide as a muted, silent preview frame with a
// play badge rather than a full player — real playback controls only show
// when `videoControls` is on (the product detail page), so a grid of cards
// never ends up with several videos fighting for audio/bandwidth at once.
//
// `expandOnClick` opens a full-screen lightbox when a photo slide is
// clicked — only for photos, since a video slide with `videoControls` is
// already a full player, and one without is inside a card whose click
// should navigate to the listing instead.
export default function MediaCarousel({
  media,
  fallbackLabel,
  fallbackColor,
  aspectClassName = "aspect-square",
  roundedClassName = "",
  videoControls = false,
  expandOnClick = false,
}: {
  media: MediaSlide[];
  fallbackLabel: string;
  fallbackColor: string;
  aspectClassName?: string;
  roundedClassName?: string;
  videoControls?: boolean;
  expandOnClick?: boolean;
}) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const current = media[active];
  const hasMultiple = media.length > 1;

  function go(delta: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActive((prev) => (prev + delta + media.length) % media.length);
  }

  return (
    <>
      <div className={`group/carousel relative overflow-hidden bg-background ${aspectClassName} ${roundedClassName}`}>
        {current ? (
          current.type === "image" ? (
            <img
              src={current.url}
              alt=""
              onClick={expandOnClick ? () => setLightbox(true) : undefined}
              className={`h-full w-full object-cover ${expandOnClick ? "cursor-zoom-in" : ""}`}
            />
          ) : (
            <video
              key={current.url}
              src={current.url}
              className="h-full w-full bg-black object-cover"
              controls={videoControls}
              muted={!videoControls}
              playsInline
            />
          )
        ) : (
          <div
            className="flex h-full items-center justify-center text-3xl font-extrabold text-black/25"
            style={{ backgroundColor: fallbackColor }}
          >
            {fallbackLabel}
          </div>
        )}

        {!videoControls && current?.type === "video" && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white">
              <Play size={16} fill="white" />
            </span>
          </span>
        )}

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={(e) => go(-1, e)}
              aria-label="Previous"
              className="absolute left-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover/carousel:opacity-100"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={(e) => go(1, e)}
              aria-label="Next"
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition group-hover/carousel:opacity-100"
            >
              <ChevronRight size={16} />
            </button>
            <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
              {media.map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === active ? "bg-white" : "bg-white/50"}`} />
              ))}
            </div>
          </>
        )}
      </div>

      {lightbox && current && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            onClick={() => setLightbox(false)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={20} />
          </button>

          {current.type === "image" ? (
            <img src={current.url} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          ) : (
            <video
              src={current.url}
              controls
              autoPlay
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          {hasMultiple && (
            <>
              <button
                onClick={(e) => go(-1, e)}
                aria-label="Previous"
                className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                onClick={(e) => go(1, e)}
                aria-label="Next"
                className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <ChevronRight size={22} />
              </button>
              <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1.5">
                {media.map((_, i) => (
                  <span key={i} className={`h-2 w-2 rounded-full ${i === active ? "bg-white" : "bg-white/40"}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
