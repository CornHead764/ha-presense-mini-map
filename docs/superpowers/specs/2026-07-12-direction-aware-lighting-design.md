# Direction-Aware Lighting — Design (v1: Master Bedroom)

Date: 2026-07-12
Status: Approved (approach and design confirmed by Cory)

## Goal

Turn lights on/off based on where a person is *walking*, not just where they
are, using the Everything Presence Lite (EPL) mmWave sensors already mapped on
the presence minimap card (dashboard view `lovelace/4`). First section: coming
up the stairs and turning toward the master bedroom turns on the bedroom
light — but only if the room is empty and nobody is in bed.

Each light/direction behavior is an independent "section" with its own enable
toggle so sections can be turned on/off while being tuned. v1 implements only
the Master Bedroom section; the architecture leaves room for more.

## Approach (chosen: A — zone-sequence tripwires)

Direction is inferred from the *ordered sequence* of EPL detection zones on the
2F Hallway sensor (`epl_2f_hallway`): stair-landing zone occupied, then
bedroom-approach zone occupied within a short window ⇒ heading toward the
bedroom. Fully native HA (zone occupancy binary sensors + automations), no new
runtime.

Rejected alternatives:
- **B — Template heading sensors**: true velocity vectors via heavy Jinja
  replicating the card's coordinate transform. Noisy at 1 Hz, hard to debug,
  anti-pattern per HA best practices.
- **C — AppDaemon trajectory engine**: most capable, but a new runtime to
  install/maintain. Kept as the upgrade path: per-light automations trigger on
  a direction signal, so the signal source can later be swapped for an
  AppDaemon-published binary sensor without restructuring the automations.

## Geometry assumptions

- Stairs land mid-hallway; master bedroom door is at the west end of the hall
  (toward the Master Bed sensor at floorplan x≈4200), bathroom/offices east.
- The hallway sensor (`epl_2f_hallway`, floorplan (4700, 5300), rotation 0,
  mirror_y) sees both the landing and the bedroom-door approach.
- EPL Lite supports 4 zones per sensor (LD2450). Zone 1 currently exists on
  the hallway sensor and nothing consumes it, so it is free to redefine.

## Zones (2F Hallway sensor, drawn in the Everything Presence Zone Configurator app)

| Zone | Covers | Purpose |
|------|--------|---------|
| 1 | Stair landing | Sequence start: "arrived upstairs" / "in the hall core" |
| 2 | West hall in front of master bedroom door | Sequence end: "heading to bedroom" |
| 3 | East hall | Reserved for future sections (bathroom, offices) |
| 4 | spare | Future |

Zone occupancy entities (`binary_sensor.epl_2f_hallway_zone_{n}_occupancy`)
appear once zones are configured. Zones also render on the minimap card, which
doubles as the tuning UI (`show_zones: true` while calibrating).

## Sections

### MB-ON — Master Bedroom entry light

- **Trigger:** zone 1 (landing) occupancy → `on`.
- **Conditions (gate):** section toggle on; sun below horizon; master bedroom
  occupancy `off`; bed presence `off` on both sides
  (`binary_sensor.bed_presence_2c4134_bed_occupied_either` is `off`).
- **Wait:** `wait_for_trigger` on zone 2 occupancy → `on`, timeout =
  `input_number.dirlight_direction_window` (default 6 s), abort on timeout.
- **Post-wait re-check:** bedroom still empty, bed still empty, pet-speed
  check (below) passes.
- **Action:** `light.turn_on` → `light.master_bedroom_light`.
- **Mode:** `restart` (a re-trigger restarts the sequence cleanly).
- Walking *out* of the bedroom hits zones in reverse (2 → 1) while the bedroom
  still reads occupied, so the guards suppress it.

### MB-OFF — Master Bedroom light off when room empties

- **Trigger:** master bedroom occupancy `off` sustained for
  `input_number.dirlight_mb_off_delay` (default 2 min).
- **Conditions:** section toggle on; bed presence both sides off; light is on.
- **Action:** `light.turn_off` → `light.master_bedroom_light`.
- **Mode:** `restart`.
- Intentionally also tidies up after manual switch use (accepted by Cory).

### Pet heuristic (inside MB-ON, one labeled condition)

At the moment zone 2 fires, require at least one hallway target speed
(`sensor.epl_2f_hallway_target_{1..3}_speed`, mph) above
`input_number.dirlight_pet_speed_threshold` (default 0.5 mph). Filters slow
pet wandering; a pet trotting the route at human speed will still trigger —
accepted limit of 2D radar. ESPresense (BLE person confirmation) is dead and
explicitly not relied on; the condition is kept in one labeled spot so it can
be replaced by a BLE check if that changes.

## Helpers (created via HA config API, labeled `direction-lighting`)

- `input_boolean.dirlight_master_bedroom` — section enable toggle
- `input_number.dirlight_direction_window` — seconds, default 6
- `input_number.dirlight_pet_speed_threshold` — mph, default 0.5
- `input_number.dirlight_mb_off_delay` — minutes, default 2

## Open item to verify during implementation

Authoritative "someone in the master bedroom" entity. Default:
`binary_sensor.everything_presence_lite_5ccc2c_occupancy` (Master Bed EPL).
Alternatives observed: `binary_sensor.epl_master_bedroom_assumed_present`;
note `binary_sensor.bedroom_occupancy` appears to belong to the *Guest*
Bedroom area — do not use it for the master bedroom.

## Testing plan

1. Enable `show_zones: true` on the view-4 minimap card while tuning.
2. Configure zones in the Zone Configurator; confirm zone entities appear and
   track a walk down the hall.
3. Temporarily disable the sun condition; walk stairs → bedroom and confirm
   the light comes on; walk bedroom → stairs and confirm it does not.
4. Lie on the bed (bed presence on) and repeat: light must not come on, and
   MB-OFF must never fire while bed presence is on.
5. Tune window/speed via helpers from a dashboard; re-enable the sun gate.

## Out of scope (future sections)

2F Hallway/stairway light, 2F Bathroom entry, offices, Guest Bedroom — same
pattern, using zone 3 (east hall) and zones on the other room sensors.
