import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getShoeCatalog } from "@/lib/shoes.functions";
import { KIOSK_MODE } from "@/config/runtime";
import type { Side, Shoe } from "@/types/wall";
import { KEYLOOK_DELAY_AFTER_REMOVAL_MS, KEYLOOK_DELAY_FRESH_MS } from "@/constants/animation";
import { useWallAuth } from "@/hooks/useWallAuth";
import { useShoeSlots } from "@/hooks/useShoeSlots";
import { IdleBackground } from "@/components/wall/IdleBackground";
import { TopQuadrant } from "@/components/wall/TopQuadrant";
import { BottomQuadrant } from "@/components/wall/BottomQuadrant";
import { KeyLookOverlay } from "@/components/wall/KeyLookOverlay";
import { LoginForm } from "@/components/wall/LoginForm";
import { PreloadProgress } from "@/components/wall/PreloadProgress";
import { useAssetPreloader } from "@/hooks/useAssetPreloader";

export const Route = createFileRoute("/")({
  component: Index,
});

/**
 * The compare wall. Composes the auth gate (useWallAuth), realtime slot state
 * (useShoeSlots), and a one-time catalog prefetch into the 2×2 quadrant
 * layout, plus the idle logo and single-shoe key-look overlay. Every scan
 * resolves from the in-memory catalog map — no server round-trip per scan.
 */
function Index() {
  const auth = useWallAuth();
  const { authState } = auth;
  const slots = useShoeSlots(authState);

  // Prefetch the whole catalog once after login; resolve every scan in memory.
  // Kiosk reads the anon `compare_wall` view directly (no session); the
  // browser/admin build uses the service-role server fn. Same return shape.
  const catalog = useQuery({
    queryKey: ["shoe-catalog", KIOSK_MODE ? "kiosk" : "server"],
    // Kiosk's anon read uses the browser Supabase client, so it's imported
    // dynamically (client-only) — index.tsx is server-rendered and can't
    // statically import a *.client module.
    queryFn: () =>
      KIOSK_MODE
        ? import("@/lib/catalog.client").then((m) => m.getCatalogFromView())
        : getShoeCatalog(),
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

  const splitByName = useMemo(() => catalog.data?.splitVideos ?? {}, [catalog.data]);

  // Preload all catalog photos at boot so a scanned shoe's image is already
  // cached and fades in instantly (progress shown on the idle screen).
  const preload = useAssetPreloader(catalog.data?.shoes);

  const leftEan = slots.left.ean;
  const rightEan = slots.right.ean;
  const shoes: Record<Side, Shoe | null> = useMemo(
    () => ({
      left: leftEan ? (byEan.get(leftEan) ?? null) : null,
      right: rightEan ? (byEan.get(rightEan) ?? null) : null,
    }),
    [leftEan, rightEan, byEan],
  );

  const { left: leftShoe, right: rightShoe } = shoes;
  const videoUrls: Record<Side, string | null> = useMemo(
    () => ({
      left: leftShoe?.commercial_name ? (splitByName[leftShoe.commercial_name] ?? null) : null,
      right: rightShoe?.commercial_name ? (splitByName[rightShoe.commercial_name] ?? null) : null,
    }),
    [leftShoe, rightShoe, splitByName],
  );

  // Track whether both sides were scanned last render, so the key look can delay
  // its reveal only after a removal (not on a fresh first scan).
  const prevBothRef = useRef(false);
  const bothScannedNow = !!leftShoe && !!rightShoe;
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
      <LoginForm
        username={auth.username}
        setUsername={auth.setUsername}
        password={auth.password}
        setPassword={auth.setPassword}
        loginError={auth.loginError}
        isLoggingIn={auth.isLoggingIn}
        onSubmit={auth.handleLogin}
      />
    );
  }

  const leftScanned = !!leftShoe;
  const rightScanned = !!rightShoe;
  // Show the scanned shoe's key look on the OPPOSITE empty half.
  const keyLookLeftSide: Side | null =
    leftScanned && !rightScanned ? "right" : !leftScanned && rightScanned ? "left" : null;
  const keyLookUrl =
    keyLookLeftSide === "right"
      ? (leftShoe?.lookbook_url ?? null)
      : keyLookLeftSide === "left"
        ? (rightShoe?.lookbook_url ?? null)
        : null;

  const keyLookDelayMs =
    keyLookLeftSide && prevBothRef.current
      ? KEYLOOK_DELAY_AFTER_REMOVAL_MS
      : KEYLOOK_DELAY_FRESH_MS;

  return (
    <main
      className="relative grid h-screen w-screen grid-cols-2 grid-rows-2 overflow-hidden"
      style={{ backgroundColor: "#EBEEF0" }}
    >
      {/* On logo, behind everything; shows through only when nothing is scanned */}
      <IdleBackground />
      {/* Boot-time asset-cache progress — idle screen only */}
      {!leftScanned && !rightScanned ? <PreloadProgress {...preload} /> : null}
      {/* Single-shoe key-look overlay, behind the quadrants */}
      <KeyLookOverlay side={keyLookLeftSide} url={keyLookUrl} delayMs={keyLookDelayMs} />

      {/* Top row */}
      <TopQuadrant shoe={leftShoe} videoUrl={videoUrls.left} />
      <TopQuadrant shoe={rightShoe} videoUrl={videoUrls.right} />
      {/* Bottom row */}
      <BottomQuadrant shoe={leftShoe} open={leftScanned} />
      <BottomQuadrant shoe={rightShoe} open={rightScanned} />
    </main>
  );
}
