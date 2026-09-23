import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { FarmLeafIcon } from "./Logo";

// Keeps the loader up for at least this long once shown, so a near-instant
// route swap doesn't just flash — and forces it back down after this long
// regardless, in case nothing ever actually changes the URL (e.g. a button
// whose action doesn't navigate).
const MIN_VISIBLE_MS = 700;
const FALLBACK_HIDE_MS = 4000;

function isSameOrigin(href: string): boolean {
  try {
    return new URL(href, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

// Every <a> and react-router <Link>/<NavLink> renders as a plain <a> tag, so
// one document-level capture listener covers all of them without touching
// each usage individually. Excludes anything that isn't really an in-app
// page transition: new tabs, downloads, tel/mailto, external sites, and
// same-page links (fragment-only or identical destination).
function isInternalPageLink(a: HTMLAnchorElement): boolean {
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;
  const href = a.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  if (/^(tel|mailto|sms):/i.test(href)) return false;
  if (!isSameOrigin(a.href)) return false;

  const dest = new URL(a.href, window.location.href);
  if (dest.pathname === window.location.pathname && dest.search === window.location.search) return false;

  return true;
}

// Did this history.pushState/replaceState call actually change the URL?
// Buttons that submit a form or save something often call replaceState with
// the same URL just to nudge state — that shouldn't pop the loader.
function urlActuallyChanges(url?: string | URL | null): boolean {
  if (url == null) return false;
  try {
    const dest = new URL(url, window.location.href);
    return dest.pathname !== window.location.pathname || dest.search !== window.location.search;
  } catch {
    return false;
  }
}

// Full-screen, blurred-backdrop loading overlay. Shows on:
//  1. Any in-app <a>/<Link> click that's really a page transition (instant
//     feedback, before the click even finishes bubbling to react-router).
//  2. Any *other* navigation — a button's onClick calling navigate() after
//     some async work, a redirect, etc. — caught by patching the History API
//     that react-router itself calls under the hood, so every button that
//     ends up changing the route is covered without touching each one.
//  3. The initial page load/reload, until the window has finished loading.
// The Farm2Me leaf mark sits still at the center with a spinning ring around
// it as the loading indicator.
export default function RouteLoader() {
  const location = useLocation();
  const [visible, setVisible] = useState(true); // true on mount — covers hard reloads/first load
  const shownAtRef = useRef(Date.now());
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    shownAtRef.current = Date.now();
    setVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => setVisible(false), FALLBACK_HIDE_MS);
  }

  // Initial page load — hide once the window (images/fonts/etc.) is done
  // loading, but never before MIN_VISIBLE_MS.
  useEffect(() => {
    function hideAfterMin() {
      const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAtRef.current));
      setTimeout(() => setVisible(false), remaining);
    }
    if (document.readyState === "complete") {
      hideAfterMin();
    } else {
      window.addEventListener("load", hideAfterMin, { once: true });
      return () => window.removeEventListener("load", hideAfterMin);
    }
  }, []);

  // Link/anchor clicks — shows immediately, ahead of react-router's own
  // onClick handler (this listener runs in the capture phase, which fires
  // before the click reaches the element and bubbles back up).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // opens in a new tab/window

      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor || !isInternalPageLink(anchor)) return;
      show();
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Any other navigation — a button's onClick calling navigate() (often
  // after an async action resolves), a redirect component, etc. React
  // Router's history package calls these two native methods for every
  // PUSH/REPLACE, so patching them once here catches all of it generically
  // instead of instrumenting every button in the app.
  useEffect(() => {
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = ((...args: Parameters<History["pushState"]>) => {
      if (urlActuallyChanges(args[2])) show();
      return originalPushState(...args);
    }) as History["pushState"];

    window.history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
      if (urlActuallyChanges(args[2])) show();
      return originalReplaceState(...args);
    }) as History["replaceState"];

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  // Hide once the route has actually changed, never sooner than MIN_VISIBLE_MS
  // after it was shown. Skips its very first run — that's the initial page
  // load, handled separately above by waiting for the window's load event
  // instead of a flat timer.
  const isFirstLocationRef = useRef(true);
  useEffect(() => {
    if (isFirstLocationRef.current) {
      isFirstLocationRef.current = false;
      return;
    }
    if (!visible) return;
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAtRef.current));
    hideTimerRef.current = setTimeout(() => setVisible(false), remaining);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/70 backdrop-blur-md">
      <div className="relative flex h-24 w-24 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-accent/25 border-t-accent" />
        <FarmLeafIcon size={44} />
      </div>
    </div>
  );
}
