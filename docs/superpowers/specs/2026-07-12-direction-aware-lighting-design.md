# Direction-Aware Lighting — Design (v1: Master Bedroom)

Date: 2026-07-12
Status: Approved (approach and design confirmed by Cory; zone layout confirmed
against live devices)

## Goal

Turn lights on/off based on where a person is *walking*, not just where they
are, using the Everything Presence Lite (EPL) mmWave sensors already mapped on
the presence minimap card (dashboard view `lovelace/4`). First section: coming
up the stairs (or down the hall from the offices) and heading toward the
master bedroom turns on the bedroom light — but only if the room is empty and
nobody is in bed.

Each light/direction behavior is an independent "section" with its own enable
toggle so sections can be turned on/off while being tuned. v1 implements only
the Master Bedroom section; the architecture leaves room for more.

## Approach (chosen: A — zone-sequence tripwires)

Direction is inferred from the *ordered sequence* of EPL detection zones on the
2F Hallway sensor: staircase zone occupied, then master-bedroom-approach zone
occupied within a short window ⇒ heading toward the bedroom. Fully native HA
(zone occupancy binary sensors + automations), no new runtime.

Rejected alternatives:
- **B — Template heading sensors**: true velocity vectors via heavy Jinja
  replicating the card's coordinate transform. Noisy at 1 Hz, hard to debug,
  anti-pattern per HA best practices.
- **C — External trajectory engine (AppDaemon)**: superseded as the upgrade
  path by a better discovery: the custom EPL firmware has an **on-device
  entry/exit decision engine** (`polygon_entry_*` zones,
  `entry_exit_enabled` switch, `entry_exit_last_decision` /
  `last_entry_zone` sensors, currently disabled). If zone sequences prove too
  coarse, enabling that engine is the v2 path — per-light automations trigger
  on a direction signal, so the signal source can be swapped without
  restructuring.

## Device reality (verified 2026-07-12)

Both EPLs run custom firmware 1.5.0 with **polygon zones** (text entities,
`x:y;x:y;...` in sensor-local mm) instead of the stock rectangle `number`
entities. Zone 2–4 occupancy sensors and all entry/exit sensors ship
**disabled by the integration** and must be enabled in the entity registry.

### 2F Hallway EPL (`5b92ec`, device "EPL 2F Hallway")

| Zone | Meaning (per Cory) | Occupancy entity | State |
|------|--------------------|------------------|-------|
| 1 | Staircase landing | `binary_sensor.epl_2f_hallway_zone_1_occupancy` | enabled |
| 2 | Offices end of hall | `binary_sensor.everything_presence_lite_5b92ec_zone_2_occupancy` | **disabled — enable** |
| 3 | Master bedroom approach | `binary_sensor.everything_presence_lite_5b92ec_zone_3_occupancy` | **disabled — enable** |

(Mixed entity prefixes are a rename artifact; keep IDs as-is for now.)

### Master Bedroom EPL (`5ccc2c`, device "EPL Master Bedroom")

- `polygon_zone_1` = **the bed** →
  `binary_sensor.everything_presence_lite_5ccc2c_zone_1_occupancy` (enabled)
- `polygon_entry_1` = doorway toward 2F hallway, `polygon_entry_2` = doorway
  toward master bathroom — inputs to the (currently off) entry/exit engine;
  not used in v1.
- Room occupancy: `binary_sensor.everything_presence_lite_5ccc2c_occupancy`
  (authoritative for v1; `occupancy_off_delay` currently 300 s).

### Other referenced entities

- Bed (pressure): `binary_sensor.bed_presence_2c4134_bed_occupied_either`
- Light: `light.master_bedroom_light`
- Pet heuristic: `sensor.epl_2f_hallway_target_{1..3}_speed` (mph)

## Sections

### MB-ON — Master Bedroom entry light

- **Triggers:** hallway zone 1 (staircase) → `on`, or hallway zone 2
  (offices) → `on`.
- **Conditions (gate):** section toggle on; sun below horizon; master bedroom
  occupancy `off`; bed empty (pressure sensor `off` **and** radar bed zone
  `off`).
- **Wait:** `wait_for_trigger` on hallway zone 3 (master bedroom approach) →
  `on`, timeout = `input_number.dirlight_direction_window` (default 6 s),
  abort on timeout.
- **Post-wait re-check:** bedroom still empty, bed still empty, pet-speed
  check passes.
- **Action:** `light.turn_on` → `light.master_bedroom_light`.
- **Mode:** `restart`.
- Walking *out* of the bedroom hits zone 3 first, then 1 or 2, while the
  bedroom still reads occupied — the guards suppress it.

### MB-OFF — Master Bedroom light off when room empties

- **Trigger:** master bedroom occupancy `off` sustained for
  `input_number.dirlight_mb_off_delay` (default 2 min; note the EPL itself
  already holds occupancy 300 s past last detection).
- **Conditions:** section toggle on; bed empty (both signals); light is on.
- **Action:** `light.turn_off` → `light.master_bedroom_light`.
- **Mode:** `restart`.
- Intentionally also tidies up after manual switch use (accepted by Cory).

### Pet heuristic (inside MB-ON, one labeled condition)

At the moment zone 3 fires, require at least one hallway target speed above
`input_number.dirlight_pet_speed_threshold` (default 0.5 mph). Filters slow
pet wandering; a pet trotting the route at human speed will still trigger —
accepted limit of 2D radar. ESPresense (BLE person confirmation) is dead and
explicitly not relied on; the condition is kept in one labeled spot so it can
be replaced by a BLE check or the firmware entry/exit decision later.

## Helpers (created via HA config API, labeled `direction-lighting`)

- `input_boolean.dirlight_master_bedroom` — section enable toggle
- `input_number.dirlight_direction_window` — seconds, default 6
- `input_number.dirlight_pet_speed_threshold` — mph, default 0.5
- `input_number.dirlight_mb_off_delay` — minutes, default 2

## Implementation prerequisites

1. Enable in the entity registry (disabled_by: integration):
   `binary_sensor.everything_presence_lite_5b92ec_zone_2_occupancy`,
   `binary_sensor.everything_presence_lite_5b92ec_zone_3_occupancy`.
2. Verify zone 2/3 occupancy off-delays behave like zone 1's 15 s (their
   `number.*_zone_{2,3}_occupancy_off_delay` entities are also disabled;
   enable if tuning is needed).

## Known limitation: minimap card cannot render polygon zones

The card reads stock `number.{id}_zone_N_begin_x/y` rectangles, which this
firmware doesn't expose — `show_zones: true` shows nothing. Testing relies on
watching zone occupancy entities and automation traces instead. Follow-up
(separate project in this repo): teach the card to parse
`text.{id}_polygon_zone_*` / `polygon_entry_*` entities.

## Testing plan

1. Enable zone 2/3 occupancy sensors; walk the hall and confirm each zone
   trips in sequence (staircase → approach, offices → approach) using
   entity history.
2. Temporarily disable the sun condition; walk stairs → bedroom and confirm
   the light comes on; walk bedroom → stairs and confirm it does not; walk
   offices → bedroom and confirm it does.
3. Lie on the bed (pressure or radar bed zone on) and repeat: light must not
   come on, and MB-OFF must never fire while the bed reads occupied.
4. Tune window/speed via helpers from a dashboard; re-enable the sun gate.

## Out of scope (future sections)

2F Hallway/stairway light, 2F Bathroom entry, offices, Guest Bedroom — same
pattern using hallway zone 2 and zones on the other room sensors. Master
bedroom entry/exit engine (firmware) as the v2 direction signal. Polygon zone
rendering in the minimap card.
