# ON Compare Wall — Code Walkthrough

An end-to-end, file-by-file tour of **both** repos in **runtime-flow order** —
from a tag touching a stand to a shoe rendering on the wall. Companion to
docs/ARCHITECTURE.md (the big-picture diagram).

- **Bridge repo** (`on-compare-grid`, branch `tss-gateway`): `rfid_bridge/` — Python.
- **Webapp repo** (`On compare wall`): the kiosk wall — TanStack Start / React.

Sections follow the flow: **bridge read pipeline → bridge output → wall boot →
auth → catalog → live scans → render → media → config/deploy.**

---

## Section 1 — Bridge: turning a tag scan into a clean event

**Goal of this stage:** a UHF reader fires the *same* tag many times a second
with a flickering signal. This stage turns that noisy stream into three clean,
deduplicated events per side: **scanned** (a shoe was placed), **swapped** (one
shoe replaced another), **removed** (the shoe was taken away). Output is a
`FilterEvent { event_type, side, epc }`.

Files: `config.py` → `main.py` (wiring) → `pulsar_client.py` → `side_manager.py`
→ `filter.py`. (EPC→EAN decoding happens in the *next* stage, not here — the
filter works purely in EPCs.)

### `config.py` — the settings shape
Loads `config.toml` into typed dataclasses: `PulsarConfig` (reader host/port,
antenna power, region), `SideConfig` (one per side: `name` + `antenna_port`),
`FilterConfig` (all the debounce/RSSI thresholds), `WebhookConfig`, `MqttConfig`,
and `server_port`. The two sides each claim an antenna port (left = 1, right = 2)
— that's how one reader serves both stands.

### `pulsar_client.py` — talking to the reader
`PulsarLRClient` wraps the metratec SDK and exposes the reader as an async stream
of `(epc, rssi, antenna)` tuples.
- `connect()` opens the reader and starts a **continuous inventory** with
  `with_rssi=True` (we need signal strength to tell "in the spot" from "nearby")
  and `fast_start=True` (~60% faster re-reads when multiplexing two antennas).
- With >1 antenna it **multiplexes** the ports and tags every read with the port
  that saw it — that antenna number is what later maps a read to left/right.
- The SDK delivers tags via a callback (`_on_inventory`) on its own thread; we
  drop each read into an `asyncio.Queue` and `__aiter__` pulls them out, so the
  rest of the bridge can simply `async for` over the reader.
- `connect_with_retry()` loops forever, so a reader that's unplugged at boot
  recovers on its own. `set_status_callback` drives the UI's connected/dropped dot.

### `side_manager.py` — routing reads to the right side
`SideManager` owns **one `SideFilter` per side** and the **one shared reader**.
- It builds an `antenna_to_side` map from config (`(host, port, antenna) → side`).
- `_read_loop()` does the core routing: `async for (epc, rssi, antenna)` from the
  reader → look up which side that antenna belongs to → hand the read to that
  side's filter via `handle_read()`.
- `update_filter_config()` hot-swaps new thresholds into every side's filter —
  that's what the **Apply** button on the status screen calls (tune live, no restart).

### `filter.py` — the debounce "brain" (the clever part)
`SideFilter` is one per side and turns raw reads into clean events. State it keeps:
a table of tags currently in view (`_tags`, keyed by EPC, each with `rssi`,
`seen_count`, `last_seen`) and the EPC it currently considers "placed"
(`_active_epc`).

- **`handle_read(epc, rssi)`** — applies **hysteresis**: a tag must be *strongly*
  in range to enter (`rssi_enter_*` window) but only has to leave a *wider* range
  to drop (`rssi_exit_*`). Two windows stop a shoe at the edge of the zone from
  flickering on/off. In-range → add/refresh the tag (bump `seen_count`); out of
  both windows → forget it. Then re-`_evaluate()`.
- **`_best_candidate()`** — picks the tag most likely to be *the* shoe in the spot:
  in the enter-window AND seen at least `min_seen_count` times, scored by
  `seen_count*0.5 + rssi`. Confidence + closeness, so a faint tag two stands over
  doesn't win.
- **`_evaluate()`** — the decision:
  - best exists, nothing active → **maybe a placement**: start `_enter_debounce`
    (don't commit yet).
  - best exists, differs from active, something *was* active → **swap** fires
    immediately (`swapped`).
  - best is gone, something was active → start `_pickup_debounce`.
- **Debounce timers** confirm the change persisted before firing:
  `_enter_debounce` waits `enter_debounce_ms` and only fires **scanned** if the
  same tag is still best; `_pickup_debounce` fires **removed** only after the spot
  stays empty across *two* checks (`pickup_debounce_ms` + `pickup_commit_ms`) —
  avoids a false removal when a read is just briefly missed.
- **`_fire()`** emits the event and starts a `state_hold_ms` window during which
  no new event can fire — anti-bounce so one placement can't ripple into several.
- **`_tick_loop()`** (started by `start()`) sweeps every 50 ms and **ages out tags
  not seen recently** (>~0.8 s). This is what makes *absence* detectable — with no
  reads, nothing else would ever notice a shoe is gone. The 0.8 s floor matters:
  two antennas multiplexed means each side is only sampled ~2×/s (~0.5 s apart),
  so a shorter window would delete a tag *between* reads and `seen_count` would
  never build up.

**Output:** a `FilterEvent { event_type: scanned|swapped|removed, side, epc }`,
handed to the `on_event` callback that `main.py`/`run_fake.py` provides. Note it
still carries the raw **EPC** — the EAN decode is the next stage.

> Tuning: thresholds were calibrated via `calibrate.py` and live in `config.toml`
> under `[filter]`; the comment there says to re-calibrate on the real stands.
