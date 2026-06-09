## Goal

Turn `/mnt/documents/on-compare-wall-spec.md` into a new markdown document, `on-compare-wall-deck.md`, structured so each H2 = one slide. Every slide carries:

- **Title** — short, presentation-ready
- **For everyone** — 2–4 sentences, plain language, no jargon
- **For developers** — bullet points with the technical specifics (APIs, tables, timings, file paths) pulled from the existing spec

The deck is grouped into 5 chapters (intro + the 4 requested). This is a content/structure document — it does not generate `.pptx`; it's the script a designer or a follow-up `pptx` skill can build slides from.

## Chapter structure

**Chapter 0 — Overview** (framing slides, not in the user's list but needed for any deck)

1. Title slide — "On Compare Wall"
2. What it is in one picture (the kiosk in the store)
3. Who this deck is for & how to read it (the "for everyone / for developers" convention)

**Chapter 1 — Concept** (what & why) 4. The problem: comparing shoes in store 5. The two-shoe wall idea 6. Scan-driven, zero-touch interaction 7. The four states: idle / one shoe / two shoes / removal 8. Hardware & environment (portrait kiosk, Vuplex/Chromium, always-on) 9. Out of scope (sets expectations)

**Chapter 2 — Experience** (what the customer sees) 10. Page layout — the 2×2 grid 11. Top quadrant — video + shoe name + tech 12. Bottom quadrant — color drape + black panel with stats 13. The bar graphs (cushioning / responsiveness / stability) 14. The data items (activity, best for, ride, distance) 15. Key Look overlay (the empty-side lookbook image) 16. Idle background (On logo) 17. Motion language — staggered drops, fades, blur, brightness ramp 18. Why the "remember last value for 1.2s" trick exists (smoothness) 19. Scaling rule — everything is proportional to screen height

**Chapter 3 — Integration** (how data flows) 20. End-to-end flow diagram (scanner → ingest → realtime → wall) 21. The scanner ingest endpoint (`/api/public/ingest/shoe-event`) 22. Supabase Realtime broadcast (why broadcast, not postgres_changes) 23. Catalog prefetch (one load, zero per-scan calls) 24. Data model — `shoes`, `shoe_slots`, `shoe_events`, `shoe_split_videos` 25. Storage & signed URLs for split videos 26. Tech stack summary (TanStack Start, Supabase, Cloudflare Workers) 27. File map (where each piece lives in the repo) 28. Environment variables 29. Edge cases & resilience (unknown EAN, fast scans, realtime drop, resize)

**Chapter 4 — Security** (trust boundaries) 30. Two trust zones — the wall vs. the scanner 31. Wall authentication — magic token + manual login fallback 32. Why we don't rewrite the password on every login 33. Scanner authentication — bearer token on the public endpoint 34. Service users (`viewer@local.app`, `node-red@local.app`) 35. Row Level Security on Supabase tables 36. Secrets handling (server-only vs client-only env vars) 37. Threat checklist & what we explicitly don't defend against

**Chapter 5 — Closing** 38. Acceptance tests (the 10 from the spec, condensed) 39. Open questions / decisions for the dev team 40. Appendix pointer — link back to the full spec for exact values

## Slide template (used for every numbered slide)

```text
## NN. <Slide title>

**For everyone**
2–4 plain-language sentences. No code, no acronyms without expansion.

**For developers**
- Concrete bullet with file path, table name, function, env var, or timing
- Another bullet
- (optional) tiny code/JSON snippet when it removes ambiguity
```

## Deliverable

- New file: `/mnt/documents/on-compare-wall-deck.md` (the slide-script)
- Source spec stays untouched at `/mnt/documents/on-compare-wall-spec.md`
- Deck doc ends with a one-line note: "Generate slides with the `pptx` skill using this file as the script."

## Out of scope for this task

- Actually rendering `.pptx` slides (separate step, ask after this is approved)
- Visual design choices (colors, fonts, layouts) beyond what's already in the spec
- Any code changes to the app itself
