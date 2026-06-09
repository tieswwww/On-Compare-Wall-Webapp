import { createFileRoute } from "@tanstack/react-router";
import onLogo from "@/assets/on-logo.png";

function IdleBackground(_: { visible: boolean }) {
  return (
    <img
      src={onLogo}
      alt=""
      className="pointer-events-none absolute z-0"
      style={{
        top: "3vh",
        right: "3vh",
        width: "6.3vh",
        mixBlendMode: "multiply",
      }}
    />
  );
}

import { useEffect, useMemo, useRef, useState, type FormEvent, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { exchangeAccessToken, signInWithUsername } from "@/lib/access.functions";
import { getShoeCatalog } from "@/lib/shoes.functions";
import { hexForSalesColor } from "@/lib/sales-colors";
import type { Side, Slot, Shoe, BroadcastPayload, AuthState } from "@/types/wall";
import {
  VIDEO_REVEAL_DELAY_MS,
  VIDEO_CLEAR_DELAY_MS,
  NAME_FADE_MS,
  SHOE_HOLD_MS,
  BOTTOM_STAGE_MS,
  BOTTOM_STAGGER_MS,
  COLOR_DRAPE_FADE_MS,
  KEYLOOK_DELAY_AFTER_REMOVAL_MS,
  KEYLOOK_DELAY_FRESH_MS,
  KEYLOOK_CLEAR_MS,
  KEYLOOK_TRANSITION_MS,
} from "@/constants/animation";

export const Route = createFileRoute("/")({
  component: Index,
});

/* ---------- scaling helpers ----------
   All scaling math runs in JavaScript and we emit plain `Npx` strings to
   the DOM. This avoids CSS `calc()`, `min()`, and length multiplication —
   features the embedded Chromium in Vuplex (Quest/Android/UWP) often
   evaluates inconsistently, which previously caused every font-size to
   collapse to the browser default and all margins/positions to drop. */
let _scale = 1; // px value of 1 unit at the current viewport (1 = design height 1920)
const _scaleListeners = new Set<() => void>();

function _computeScale(): number {
  if (typeof window === "undefined") return 1;
  // Height-only, 1:1 linear scaling against the 1920px portrait design height.
  // Text and assets grow/shrink proportionally with screen height only;
  // width has no effect. At 1920px tall → scale 1 (design size).
  return window.innerHeight / 1920;
}

if (typeof window !== "undefined") {
  _scale = _computeScale();
  const update = () => {
    const next = _computeScale();
    if (next === _scale) return;
    _scale = next;
    _scaleListeners.forEach((l) => l());
  };
  window.addEventListener("resize", update);
}

function useU() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    _scaleListeners.add(l);
    // Sync once on mount in case scale changed between SSR and hydration.
    l();
    return () => {
      _scaleListeners.delete(l);
    };
  }, []);
  // Text scales at half the canvas scale — designed sizes were ~2x what
  // actually reads well on screen. Spacing helper `u()` is unchanged; use
  // `ut()` for spacing that should track text (gaps between label/value,
  // letter-spacing, etc.) so it shrinks with the text.
  const u = (n: number): string => `${(n * _scale).toFixed(2)}px`;
  const ut = (n: number): string => `${(n * _scale * 0.7).toFixed(2)}px`;
  const px = (n: number): CSSProperties => ({ fontSize: ut(n) });
  return { u, ut, px };
}

/* ---------- bar graph (1-5) ---------- */
function BarGraph({ value }: { value: number | null | undefined }) {
  const { u } = useU();
  const v = Math.max(0, Math.min(5, value ?? 0));
  return (
    <div className="flex" style={{ gap: u(14) }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="bg-[#EBEEF0]"
          style={{
            width: u(84),
            height: u(6),
            opacity: i <= v ? 1 : 0.18,
          }}
        />
      ))}
    </div>
  );
}

/* ---------- multi-line value (splits on comma or newline) ---------- */
function splitLines(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .split(/<br\s*\/?>|\r?\n|,\s*/gi)
    .map((l) => l.trim())
    .filter(Boolean);
}

function DataItem({ label, value }: { label: string; value: string | null | undefined }) {
  const { u, ut, px } = useU();
  const lines = splitLines(value);
  if (lines.length === 0) return null;
  return (
    <div style={{ marginBottom: u(21) }}>
      <div
        className="font-mono uppercase text-[#EBEEF0]/55"
        style={{ ...px(18), letterSpacing: ut(1.5), marginBottom: ut(9) }}
      >
        {label}
      </div>
      {lines.map((line, i) => (
        <div
          key={i}
          className="font-sans font-bold text-[#EBEEF0]"
          style={{ ...px(33), lineHeight: 1.5 }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

/* ---------- top quadrant: video + name ---------- */
function TopQuadrant({ shoe, videoUrl }: { shoe: Shoe | null; videoUrl: string | null }) {
  const { u, ut, px } = useU();
  const [displayedVideoUrl, setDisplayedVideoUrl] = useState<string | null>(videoUrl);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoDelayElapsed, setVideoDelayElapsed] = useState(false);
  // Keep last shoe so name/tech stay rendered while fading out on removal.
  const [displayedShoe, setDisplayedShoe] = useState<Shoe | null>(shoe);

  useEffect(() => {
    if (videoUrl) {
      setDisplayedVideoUrl(videoUrl);
      setVideoLoaded(false);
      setVideoDelayElapsed(false);
      // Load the video immediately, but only reveal it after the delay.
      const t = setTimeout(() => setVideoDelayElapsed(true), VIDEO_REVEAL_DELAY_MS);
      return () => clearTimeout(t);
    }
    setVideoDelayElapsed(false);
    const t = setTimeout(() => {
      setDisplayedVideoUrl(null);
      setVideoLoaded(false);
    }, VIDEO_CLEAR_DELAY_MS);
    return () => clearTimeout(t);
  }, [videoUrl]);

  useEffect(() => {
    if (shoe) {
      setDisplayedShoe(shoe);
      return;
    }
    // Clear text only after the close animation has played out.
    const t = setTimeout(() => setDisplayedShoe(null), SHOE_HOLD_MS);
    return () => clearTimeout(t);
  }, [shoe]);

  const videoVisible = !!videoUrl && videoLoaded && videoDelayElapsed;

  const techText = displayedShoe?.technology
    ? displayedShoe.technology.split(/,\s*/).filter(Boolean).join("  |  ")
    : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {displayedVideoUrl ? (
        <video
          key={displayedVideoUrl}
          src={displayedVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          onLoadedData={() => setVideoLoaded(true)}
          className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${
            videoVisible ? "opacity-100" : "opacity-0"
          }`}
          style={{ paddingTop: u(125), paddingBottom: u(240) }}
        />
      ) : null}

      {/* Fallback: static product photo when this shoe has no split video.
          Most catalog shoes have a gallery image but no demo video (yet). */}
      {!displayedVideoUrl && displayedShoe?.image_url ? (
        <img
          key={displayedShoe.image_url}
          src={displayedShoe.image_url}
          alt=""
          className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${
            shoe?.image_url ? "opacity-100" : "opacity-0"
          }`}
          style={{ paddingTop: u(125), paddingBottom: u(240) }}
        />
      ) : null}

      {/* Name + tech: anchored to the bottom of the top quadrant.
          Position is fixed regardless of whether a video is loaded. */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center text-center"
        style={{
          bottom: u(184),
          opacity: shoe ? 1 : 0,
          filter: shoe ? "blur(0px)" : `blur(${u(72)})`,
          transition: `opacity ${NAME_FADE_MS}ms ease-in-out, filter ${NAME_FADE_MS}ms ease-in-out`,
        }}
      >
        <div className="font-sans font-bold text-black" style={{ ...px(72), lineHeight: 1 }}>
          {displayedShoe?.commercial_name ?? "—"}
        </div>
        {techText ? (
          <div
            className="font-sans text-black/70"
            style={{ ...px(26), marginTop: ut(18), letterSpacing: ut(0.3) }}
          >
            {techText}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- bottom quadrant: two-stage reveal ----------
   Stage 1: color panel (sales color) drops down from top.
   Stage 2: black panel drops down on top of it, revealing the stats.
   On close, the order reverses: black retracts first, then the color. */
function BottomQuadrant({ shoe, open }: { shoe: Shoe | null; open: boolean }) {
  const { u, ut, px } = useU();
  const liveHex = hexForSalesColor(shoe?.sales_color_name);
  // Remember the color used while the panel was open, so the closing
  // animation keeps the color of the shoe that was just removed.
  const [colorHex, setColorHex] = useState<string>(liveHex);
  // Same idea for the shoe content — keep rendering the last shoe's stats
  // while the panel closes, then clear once it's offscreen.
  const [displayedShoe, setDisplayedShoe] = useState<Shoe | null>(shoe);
  useEffect(() => {
    if (shoe?.sales_color_name) setColorHex(liveHex);
  }, [shoe?.sales_color_name, liveHex]);
  useEffect(() => {
    if (shoe) {
      setDisplayedShoe(shoe);
      return;
    }
    const t = setTimeout(() => setDisplayedShoe(null), SHOE_HOLD_MS);
    return () => clearTimeout(t);
  }, [shoe]);
  const s = displayedShoe;
  const colorDelay = open ? 0 : BOTTOM_STAGGER_MS; // close: black leaves first, color follows shortly
  const blackDelay = open ? BOTTOM_STAGGER_MS : 0; // open:  color drops first, black follows shortly

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Stage 1: color drape */}
      <div
        className="absolute inset-0"
        style={{
          background: colorHex,
          opacity: 0.8,

          clipPath: open ? "inset(0 0 0 0)" : "inset(0 0 100% 0)",
          transition: `clip-path ${BOTTOM_STAGE_MS}ms cubic-bezier(0.7, 0, 0.2, 1) ${colorDelay}ms, background-color ${COLOR_DRAPE_FADE_MS}ms ease`,
        }}
      />
      {/* Stage 2: black panel with content */}
      <div
        className="absolute inset-0 bg-black text-[#EBEEF0]"
        style={{
          clipPath: open ? "inset(0 0 0 0)" : "inset(0 0 100% 0)",
          transition: `clip-path ${BOTTOM_STAGE_MS}ms cubic-bezier(0.7, 0, 0.2, 1) ${blackDelay}ms`,
        }}
      >
        {/* Top-aligned, horizontally centered column. Items inside stay left-aligned. */}
        <div className="flex h-full w-full flex-col items-center" style={{ paddingTop: u(119) }}>
          <div className="flex flex-col items-start" style={{ width: "fit-content" }}>
            {/* Energy header */}
            <div
              className="font-sans font-bold text-[#EBEEF0]"
              style={{ ...px(66), lineHeight: 1, marginBottom: u(40) }}
            >
              {s?.experience ?? "Energy"}
            </div>

            {/* Bar graph stats */}
            <div style={{ marginBottom: u(62) }}>
              <div style={{ marginBottom: u(24) }}>
                <div
                  className="font-mono uppercase text-[#EBEEF0]/55"
                  style={{ ...px(29), letterSpacing: ut(1.5), marginBottom: ut(18) }}
                >
                  Cushioning
                </div>
                <BarGraph value={s?.cushioning_scale} />
              </div>
              <div style={{ marginBottom: u(24) }}>
                <div
                  className="font-mono uppercase text-[#EBEEF0]/55"
                  style={{ ...px(29), letterSpacing: ut(1.5), marginBottom: ut(18) }}
                >
                  Responsiveness
                </div>
                <BarGraph value={s?.responsiveness_scale} />
              </div>
              <div>
                <div
                  className="font-mono uppercase text-[#EBEEF0]/55"
                  style={{ ...px(29), letterSpacing: ut(1.5), marginBottom: ut(18) }}
                >
                  Stability
                </div>
                <BarGraph value={s?.stability_scale} />
              </div>
            </div>

            {/* Data items */}
            <DataItem label="Activity" value={s?.activity_type} />
            <DataItem label="Best For" value={s?.activity_best_for} />
            <DataItem label="Ride Type/Feel" value={s?.ride_type} />
            <DataItem label="Recommended Distance" value={s?.recommended_distance} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Index() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [username, setUsername] = useState("viewer");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [slots, setSlots] = useState<Record<Side, Slot>>({
    left: { side: "left", ean: null, updated_at: "" },
    right: { side: "right", ean: null, updated_at: "" },
  });

  // 1. Auth gate via ?k=... or existing session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // Remove the one-time magic token from the URL + history once we've used it
    // (on success OR failure), so it isn't left visible on screen.
    const stripTokenParam = (params: URLSearchParams) => {
      params.delete("k");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    };

    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        if (!cancelled) setAuthState("authed");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const k = params.get("k");
      if (!k) {
        if (!cancelled) setAuthState("denied");
        return;
      }

      try {
        const tokens = await exchangeAccessToken({ data: { token: k } });
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });
        if (error) throw error;

        stripTokenParam(params);
        if (!cancelled) setAuthState("authed");
      } catch (err) {
        console.error("Access token exchange failed", err);
        stripTokenParam(params);
        if (!cancelled) setAuthState("denied");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Data + realtime, only once authed.
  useEffect(() => {
    if (authState !== "authed") return;
    if (typeof window === "undefined") return;

    let mounted = true;
    let removeRealtimeChannel: (() => void) | undefined;

    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (!mounted) return;

      supabase
        .from("shoe_slots")
        .select("*")
        .then(({ data, error }) => {
          if (!mounted) return;
          if (error) {
            console.error("Failed to load initial shoe_slots", error);
            return;
          }
          if (!data) return;
          setSlots((prev) => {
            const next = { ...prev };
            for (const row of data as Slot[]) next[row.side] = row;
            return next;
          });
        });

      const channel = supabase
        .channel("shoe-events")
        .on("broadcast", { event: "update" }, ({ payload }) => {
          const p = payload as BroadcastPayload;
          if (p.side !== "left" && p.side !== "right") return;
          const side = p.side;
          const ean = p.event_type === "removed" ? null : p.ean;
          setSlots((prev) => ({
            ...prev,
            [side]: { side, ean, updated_at: p.ts },
          }));
        })
        .subscribe();

      removeRealtimeChannel = () => {
        supabase.removeChannel(channel);
      };
    });

    return () => {
      mounted = false;
      removeRealtimeChannel?.();
    };
  }, [authState]);

  // 3. Prefetch the full shoe catalog + signed split-video URLs once after
  // login. Every EAN scan is then resolved synchronously from this cache —
  // no server round-trip per scan.
  const catalog = useQuery({
    queryKey: ["shoe-catalog"],
    queryFn: () => getShoeCatalog(),
    enabled: authState === "authed",
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const byEan = useMemo(() => {
    const m = new Map<string, Shoe>();
    for (const s of catalog.data?.shoes ?? []) m.set(s.ean, s as Shoe);
    return m;
  }, [catalog.data]);
  const splitByName = catalog.data?.splitVideos ?? {};

  const shoes: Record<Side, Shoe | null> = useMemo(
    () => ({
      left: slots.left.ean ? (byEan.get(slots.left.ean) ?? null) : null,
      right: slots.right.ean ? (byEan.get(slots.right.ean) ?? null) : null,
    }),
    [slots.left.ean, slots.right.ean, byEan],
  );

  const videoUrls: Record<Side, string | null> = useMemo(
    () => ({
      left: shoes.left?.commercial_name ? (splitByName[shoes.left.commercial_name] ?? null) : null,
      right: shoes.right?.commercial_name
        ? (splitByName[shoes.right.commercial_name] ?? null)
        : null,
    }),
    [shoes.left, shoes.right, splitByName],
  );

  async function applySession(tokens: { access_token: string; refresh_token: string }) {
    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
    if (error) throw error;
    setAuthState("authed");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const tokens = await signInWithUsername({ data: { username, password } });
      await applySession(tokens);
    } catch {
      setLoginError("Invalid username or password");
    } finally {
      setIsLoggingIn(false);
    }
  }

  // Track whether both quadrants were scanned in the previous render, so the
  // key look overlay can decide whether to delay its reveal (only after a
  // removal, not on a fresh first scan).
  const prevBothRef = useRef(false);
  const bothScannedNow = !!slots.left.ean && !!shoes.left && !!slots.right.ean && !!shoes.right;
  useEffect(() => {
    prevBothRef.current = bothScannedNow;
  }, [bothScannedNow]);

  if (authState === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </main>
    );
  }

  if (authState === "denied") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
        <div className="w-full max-w-sm">
          <h1 className="mb-2 text-xl font-semibold">Sign in</h1>
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                autoComplete="username"
              />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                type="password"
                autoComplete="current-password"
              />
            </label>
            {loginError ? <p className="text-sm text-destructive">{loginError}</p> : null}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {isLoggingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  const leftScanned = !!slots.left.ean && !!shoes.left;
  const rightScanned = !!slots.right.ean && !!shoes.right;
  // Show the scanned shoe's key look on the OPPOSITE empty half.
  const keyLookLeftSide: Side | null =
    leftScanned && !rightScanned ? "right" : !leftScanned && rightScanned ? "left" : null;
  const keyLookUrl =
    keyLookLeftSide === "right"
      ? (shoes.left?.lookbook_url ?? null)
      : keyLookLeftSide === "left"
        ? (shoes.right?.lookbook_url ?? null)
        : null;

  // Delay only when the overlay appears because a shoe was REMOVED.
  const keyLookDelayMs =
    keyLookLeftSide && prevBothRef.current
      ? KEYLOOK_DELAY_AFTER_REMOVAL_MS
      : KEYLOOK_DELAY_FRESH_MS;

  return (
    <main
      className="relative grid h-screen w-screen grid-cols-2 grid-rows-2 overflow-hidden"
      style={{ backgroundColor: "#EBEEF0" }}
    >
      {/* Idle background video — shown only when no shoe is scanned */}
      <IdleBackground visible={!leftScanned && !rightScanned} />
      {/* Key look overlay sits behind everything */}
      <KeyLookOverlay side={keyLookLeftSide} url={keyLookUrl} delayMs={keyLookDelayMs} />

      {/* Top row */}
      <TopQuadrant shoe={shoes.left} videoUrl={videoUrls.left} />
      <TopQuadrant shoe={shoes.right} videoUrl={videoUrls.right} />
      {/* Bottom row */}
      <BottomQuadrant shoe={shoes.left} open={leftScanned} />
      <BottomQuadrant shoe={shoes.right} open={rightScanned} />
    </main>
  );
}

function KeyLookOverlay({
  side,
  url,
  delayMs = 0,
}: {
  side: Side | null;
  url: string | null;
  delayMs?: number;
}) {
  const [displayedUrl, setDisplayedUrl] = useState<string | null>(url);
  const [displayedSide, setDisplayedSide] = useState<Side | null>(side);
  const [loaded, setLoaded] = useState(false);
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [lit, setLit] = useState(false);

  // Always read the latest delay via a ref so this effect can depend only on
  // (url, side). Otherwise, when delayMs changes on a later render (e.g. once
  // prevBothRef flips back to false), the effect re-fires and arms a NEW,
  // shorter timer mid-transition.
  const delayRef = useRef(delayMs);
  delayRef.current = delayMs;

  // Start loading the image immediately when a new url arrives, but defer
  // the reveal until BOTH the image has decoded AND the delay has elapsed.
  useEffect(() => {
    if (url && side) {
      setDisplayedUrl(url);
      setDisplayedSide(side);
      setLoaded(false);
      setLit(false);
      setDelayElapsed(false);
      const t = setTimeout(() => setDelayElapsed(true), delayRef.current);
      return () => clearTimeout(t);
    }
    setDelayElapsed(false);
    const t = setTimeout(() => {
      setDisplayedUrl(null);
      setLoaded(false);
      setLit(false);
    }, KEYLOOK_CLEAR_MS);
    return () => clearTimeout(t);
  }, [url, side]);

  const visible = !!url && loaded && delayElapsed;

  // Start lightening shortly after the fade-in begins so the two transitions overlap.
  useEffect(() => {
    if (!visible) {
      setLit(false);
      return;
    }
    const t = setTimeout(() => setLit(true), 0);
    return () => clearTimeout(t);
  }, [visible]);

  if (!displayedUrl || !displayedSide) return null;

  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 z-0 overflow-hidden"
      style={{
        left: displayedSide === "left" ? 0 : "50%",
        right: displayedSide === "right" ? 0 : "50%",
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.98)",
        transformOrigin: "center center",
        transition: `opacity ${KEYLOOK_TRANSITION_MS}ms ease-in-out, transform ${KEYLOOK_TRANSITION_MS}ms ${visible ? "ease-out" : "ease-in"}`,
      }}
    >
      <img
        key={displayedUrl}
        src={displayedUrl}
        alt=""
        decoding="async"
        onLoad={(e) => {
          const img = e.currentTarget;
          // Wait for decode so the fade only starts once pixels are ready to paint.
          if (img.decode) {
            img
              .decode()
              .then(() => setLoaded(true))
              .catch(() => setLoaded(true));
          } else {
            setLoaded(true);
          }
        }}
        className="h-full w-full object-cover"
        style={{
          filter: lit ? "brightness(1)" : "brightness(0)",
          transition: `filter ${KEYLOOK_TRANSITION_MS}ms ease-in-out`,
        }}
      />
    </div>
  );
}
