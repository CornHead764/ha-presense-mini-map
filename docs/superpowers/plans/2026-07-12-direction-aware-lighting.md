# Direction-Aware Lighting (v1: Master Bedroom) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Walking from the staircase or offices toward the master bedroom turns on `light.master_bedroom_light` (only when dark, room empty, bed empty); the light turns off when the room empties.

**Architecture:** Zone-sequence tripwires on the 2F Hallway EPL (zone 1 = staircase, zone 2 = offices, zone 3 = bedroom approach). One "entry" automation (trigger zone 1/2 → wait for zone 3), one "off" automation, both gated by an `input_boolean` per the sections pattern. All HA config is created via the Home Assistant MCP tools — never by editing YAML files.

**Tech Stack:** Home Assistant config API via MCP (`ha_config_set_helper`, `ha_set_entity`, `ha_config_set_automation`, `ha_config_set_dashboard`, `ha_call_service`, `ha_get_state`, `ha_get_automation_traces`). No repo code changes.

**Spec:** `docs/superpowers/specs/2026-07-12-direction-aware-lighting-design.md`

## Global Constraints

- Use `entity_id`, never `device_id`, in all triggers/conditions/actions.
- Native triggers/conditions everywhere; templates ONLY where a helper value must parameterize a duration (`wait_for_trigger` timeout, trigger `for:`).
- Automation modes: both automations use `mode: restart`.
- All created helpers and automations get the `direction_lighting` label.
- Entity IDs are load-bearing and mixed-prefix (rename artifacts) — copy them exactly:
  - Hallway zone 1 (staircase): `binary_sensor.epl_2f_hallway_zone_1_occupancy`
  - Hallway zone 2 (offices): `binary_sensor.everything_presence_lite_5b92ec_zone_2_occupancy`
  - Hallway zone 3 (bedroom approach): `binary_sensor.everything_presence_lite_5b92ec_zone_3_occupancy`
  - Bedroom occupancy: `binary_sensor.everything_presence_lite_5ccc2c_occupancy`
  - Radar bed zone: `binary_sensor.everything_presence_lite_5ccc2c_zone_1_occupancy`
  - Bed pressure: `binary_sensor.bed_presence_2c4134_bed_occupied_either`
  - Hallway target speeds (mph): `sensor.epl_2f_hallway_target_{1,2,3}_speed`
  - Light: `light.master_bedroom_light`
- Do not rename any existing entity in this project.

---

### Task 1: Enable the disabled hallway zone entities

The zone 2/3 occupancy sensors (and their off-delay numbers) exist on the
device but are `disabled_by: integration` in the entity registry.

**Files:** none (HA registry only).

**Interfaces:**
- Produces: live states for `binary_sensor.everything_presence_lite_5b92ec_zone_2_occupancy` and `..._zone_3_occupancy` (consumed by Tasks 4, 5, 6).

- [ ] **Step 1: Enable the four registry entries** — call `ha_set_entity` once per entity (single-entity calls; `enabled` doesn't support bulk):

```
ha_set_entity(entity_id="binary_sensor.everything_presence_lite_5b92ec_zone_2_occupancy", enabled=True)
ha_set_entity(entity_id="binary_sensor.everything_presence_lite_5b92ec_zone_3_occupancy", enabled=True)
ha_set_entity(entity_id="number.everything_presence_lite_5b92ec_zone_2_occupancy_off_delay", enabled=True)
ha_set_entity(entity_id="number.everything_presence_lite_5b92ec_zone_3_occupancy_off_delay", enabled=True)
```

- [ ] **Step 2: Wait for the ESPHome entry to reload** (a registry enable
  requires the config entry to reload before states appear — HA does this
  automatically after ~30 s, or reload config entry `01JQ0N9NZZEMQJMWWAJDC160AG`
  via `ha_reload_core` / integration reload if states stay missing).

- [ ] **Step 3: Verify states exist**

```
ha_get_state(["binary_sensor.everything_presence_lite_5b92ec_zone_2_occupancy",
              "binary_sensor.everything_presence_lite_5b92ec_zone_3_occupancy",
              "number.everything_presence_lite_5b92ec_zone_2_occupancy_off_delay",
              "number.everything_presence_lite_5b92ec_zone_3_occupancy_off_delay"], fields=["state"])
```

Expected: all four return a real state (`on`/`off`, numeric) — NOT 404, NOT
`unavailable`. If off-delays differ wildly from zone 1's 15 s, set them to 15
via `ha_call_service("number.set_value", ...)`.

---

### Task 2: Create the label and the four helpers

**Files:** none (HA config API only).

**Interfaces:**
- Produces: label id `direction_lighting`; `input_boolean.dirlight_master_bedroom`, `input_number.dirlight_direction_window`, `input_number.dirlight_pet_speed_threshold`, `input_number.dirlight_mb_off_delay` (consumed by Tasks 3–5).

- [ ] **Step 1: Create the label**

```
ha_config_set_label(name="Direction Lighting", icon="mdi:walk", color="indigo",
                    description="Direction-aware lighting sections (spec 2026-07-12)")
```

Record the returned `label_id` (expected slug: `direction_lighting`).

- [ ] **Step 2: Create the helpers** (names chosen so generated entity IDs
  match the spec exactly; no `initial` — helpers must restore on restart):

```
ha_config_set_helper(helper_type="input_boolean", name="Dirlight Master Bedroom",
                     icon="mdi:bed", labels=["direction_lighting"])
ha_config_set_helper(helper_type="input_number", name="Dirlight Direction Window",
                     min_value=2, max_value=30, step=1, unit_of_measurement="s",
                     mode="slider", icon="mdi:timer-sand", labels=["direction_lighting"])
ha_config_set_helper(helper_type="input_number", name="Dirlight Pet Speed Threshold",
                     min_value=0, max_value=3, step=0.1, unit_of_measurement="mph",
                     mode="slider", icon="mdi:dog-side", labels=["direction_lighting"])
ha_config_set_helper(helper_type="input_number", name="Dirlight MB Off Delay",
                     min_value=0, max_value=30, step=0.5, unit_of_measurement="min",
                     mode="slider", icon="mdi:timer-off-outline", labels=["direction_lighting"])
```

- [ ] **Step 3: Set defaults and arm the section**

```
ha_call_service("input_number.set_value", entity_id="input_number.dirlight_direction_window", value=6)
ha_call_service("input_number.set_value", entity_id="input_number.dirlight_pet_speed_threshold", value=0.5)
ha_call_service("input_number.set_value", entity_id="input_number.dirlight_mb_off_delay", value=2)
ha_call_service("input_boolean.turn_on", entity_id="input_boolean.dirlight_master_bedroom")
```

- [ ] **Step 4: Verify** — `ha_get_state` on all four; expect `on`, `6.0`, `0.5`, `2.0`.

---

### Task 3: Create the MB-ON automation

**Files:** none.

**Interfaces:**
- Consumes: helpers from Task 2, zone entities from Task 1.
- Produces: `automation.dirlight_master_bedroom_entry` (referenced by Tasks 5, 6).

- [ ] **Step 1: Create via `ha_config_set_automation`** with this exact config
  (JSON equivalent of the YAML below). The two duration templates are the only
  templates; everything else is native.

```yaml
alias: "Dirlight: Master Bedroom Entry"
description: >-
  Direction-aware entry light (spec 2026-07-12). Staircase/offices zone then
  bedroom-approach zone within the direction window = walking to the master
  bedroom. Section toggle: input_boolean.dirlight_master_bedroom.
mode: restart
max_exceeded: silent
triggers:
  - trigger: state
    entity_id:
      - binary_sensor.epl_2f_hallway_zone_1_occupancy
      - binary_sensor.everything_presence_lite_5b92ec_zone_2_occupancy
    to: "on"
    note: "Zone 1 = staircase landing, zone 2 = offices end of hall."
conditions:
  - condition: state
    entity_id: input_boolean.dirlight_master_bedroom
    state: "on"
  - condition: state
    entity_id: sun.sun
    state: "below_horizon"
    enabled: true
    note: "Dark gate. Set enabled: false temporarily for daytime walk tests."
  - condition: state
    entity_id: binary_sensor.everything_presence_lite_5ccc2c_occupancy
    state: "off"
    note: "Master bedroom must be empty."
  - condition: state
    entity_id: binary_sensor.bed_presence_2c4134_bed_occupied_either
    state: "off"
  - condition: state
    entity_id: binary_sensor.everything_presence_lite_5ccc2c_zone_1_occupancy
    state: "off"
    note: "Radar bed zone backs up the pressure sensor."
actions:
  - wait_for_trigger:
      - trigger: state
        entity_id: binary_sensor.everything_presence_lite_5b92ec_zone_3_occupancy
        to: "on"
    timeout: "{{ states('input_number.dirlight_direction_window') | int(6) }}"
    continue_on_timeout: false
    note: "Zone 3 = master bedroom approach. Timeout seconds from helper."
  - condition: state
    entity_id: binary_sensor.everything_presence_lite_5ccc2c_occupancy
    state: "off"
  - condition: state
    entity_id: binary_sensor.bed_presence_2c4134_bed_occupied_either
    state: "off"
  - condition: or
    conditions:
      - condition: numeric_state
        entity_id: sensor.epl_2f_hallway_target_1_speed
        above: input_number.dirlight_pet_speed_threshold
      - condition: numeric_state
        entity_id: sensor.epl_2f_hallway_target_2_speed
        above: input_number.dirlight_pet_speed_threshold
      - condition: numeric_state
        entity_id: sensor.epl_2f_hallway_target_3_speed
        above: input_number.dirlight_pet_speed_threshold
    note: "PET HEURISTIC — the one labeled spot to replace with a BLE check later."
  - action: light.turn_on
    target:
      entity_id: light.master_bedroom_light
```

- [ ] **Step 2: Check the response** — `best_practice_warnings` should be
  empty apart from (acceptable) notes about the two duration templates; the
  returned `automation_id` should be `automation.dirlight_master_bedroom_entry`.
  If the slug differs, record the actual id for Tasks 5/6.

- [ ] **Step 3: Label it**

```
ha_set_entity(entity_id="automation.dirlight_master_bedroom_entry", labels=["direction_lighting"], label_operation="add")
```

- [ ] **Step 4: Verify round-trip** — `ha_config_get_automation("automation.dirlight_master_bedroom_entry")`
  returns the config with all five conditions and the wait step intact, and
  `ha_get_state` shows state `on`.

---

### Task 4: Create the MB-OFF automation

**Files:** none.

**Interfaces:**
- Consumes: helpers from Task 2.
- Produces: `automation.dirlight_master_bedroom_off` (referenced by Tasks 5, 6).

- [ ] **Step 1: Create via `ha_config_set_automation`:**

```yaml
alias: "Dirlight: Master Bedroom Off"
description: >-
  Turns the master bedroom light off after the room stays empty (spec
  2026-07-12). Never fires while the bed reads occupied. Also tidies up after
  manual switch use (intentional).
mode: restart
max_exceeded: silent
triggers:
  - trigger: state
    entity_id: binary_sensor.everything_presence_lite_5ccc2c_occupancy
    to: "off"
    for: "{{ (states('input_number.dirlight_mb_off_delay') | float(2)) * 60 }}"
    note: "Delay minutes from helper, rendered to seconds. EPL itself already holds occupancy 300 s."
conditions:
  - condition: state
    entity_id: input_boolean.dirlight_master_bedroom
    state: "on"
  - condition: state
    entity_id: binary_sensor.bed_presence_2c4134_bed_occupied_either
    state: "off"
  - condition: state
    entity_id: binary_sensor.everything_presence_lite_5ccc2c_zone_1_occupancy
    state: "off"
  - condition: state
    entity_id: light.master_bedroom_light
    state: "on"
actions:
  - action: light.turn_off
    target:
      entity_id: light.master_bedroom_light
```

- [ ] **Step 2: Label it** — same `ha_set_entity` call pattern as Task 3 Step 3,
  entity `automation.dirlight_master_bedroom_off`.

- [ ] **Step 3: Verify round-trip** — `ha_config_get_automation` returns the
  config; `ha_get_state` shows `on`.

---

### Task 5: Add the tuning card to the dashboard

**Files:** none (dashboard `default`, view 4 — the "Upstairs Presence Map" view).

**Interfaces:**
- Consumes: everything created in Tasks 1–4.

- [ ] **Step 1: Fetch current config hash** —
  `ha_config_get_dashboard(url_path="default")`; note `config_hash`.

- [ ] **Step 2: Append an entities card** to the minimap's section via
  `ha_config_set_dashboard` `python_transform` (target section:
  `config['views'][4]['sections'][1]['cards']`), passing the `config_hash`:

```python
config['views'][4]['sections'][1]['cards'].append({
    "type": "entities",
    "title": "Direction Lighting - Master Bedroom",
    "entities": [
        "input_boolean.dirlight_master_bedroom",
        "automation.dirlight_master_bedroom_entry",
        "automation.dirlight_master_bedroom_off",
        "input_number.dirlight_direction_window",
        "input_number.dirlight_pet_speed_threshold",
        "input_number.dirlight_mb_off_delay",
        "binary_sensor.epl_2f_hallway_zone_1_occupancy",
        "binary_sensor.everything_presence_lite_5b92ec_zone_2_occupancy",
        "binary_sensor.everything_presence_lite_5b92ec_zone_3_occupancy",
    ],
})
```

- [ ] **Step 3: Verify** — re-fetch with
  `ha_config_get_dashboard(url_path="default", entity_id="input_boolean.dirlight_master_bedroom")`;
  expect one match in view 4. Ask Cory to confirm the card renders.

---

### Task 6: Walk tests and tuning

**Files:** none. Requires Cory physically walking; run during daylight with
the sun gate disabled, then restore.

- [ ] **Step 1: Disable the sun gate temporarily** — fetch
  `ha_config_get_automation("automation.dirlight_master_bedroom_entry")` for
  `config_hash`, then:

```
ha_config_set_automation(identifier="automation.dirlight_master_bedroom_entry",
    config_hash="<hash>",
    python_transform="config['conditions'][1]['enabled'] = False")
```

- [ ] **Step 2: Zone sanity walk** — Cory walks staircase → bedroom door.
  Check `ha_get_history` for the three hallway zone sensors over the last
  10 min: zone 1 then zone 3 must both show `on` pulses (zone 2 stays off).

- [ ] **Step 3: Entry test (positive)** — with bedroom empty and bed empty,
  walk stairs → bedroom. Expected: light turns on as you reach the door.
  Check `ha_get_automation_traces("automation.dirlight_master_bedroom_entry")` —
  the trace should show the wait completing and all conditions passing.

- [ ] **Step 4: Offices route test (positive)** — walk offices end → bedroom.
  Expected: light on; trace shows zone 2 trigger.

- [ ] **Step 5: Exit test (negative)** — start inside the bedroom, walk out to
  the stairs. Expected: light does NOT turn on (bedroom occupancy guard while
  leaving). Trace shows a condition block, or no run at all.

- [ ] **Step 6: Bed guard test (negative)** — one person lies on the bed,
  second person (or same person after occupancy clears — lie on bed, wait for
  hallway to clear, have the walk repeated) walks stairs → bedroom. Expected:
  no light. Also confirm MB-OFF never fires while
  `binary_sensor.bed_presence_2c4134_bed_occupied_either` is `on`.

- [ ] **Step 7: Off test** — leave the bedroom empty with the light on.
  Expected: light off ~2 min after `..._5ccc2c_occupancy` goes `off`
  (which itself trails last motion by its 300 s off-delay — total ≈ 7 min;
  tune `number.everything_presence_lite_5ccc2c_occupancy_off_delay` and/or
  `input_number.dirlight_mb_off_delay` if too long).

- [ ] **Step 8: Tune** — adjust direction window / pet speed via the dashboard
  card based on misses or false fires. If zone transitions feel laggy, check
  `select.everything_presence_lite_5b92ec_update_speed`.

- [ ] **Step 9: Restore the sun gate**

```
ha_config_set_automation(identifier="automation.dirlight_master_bedroom_entry",
    config_hash="<fresh hash>",
    python_transform="config['conditions'][1]['enabled'] = True")
```

- [ ] **Step 10: Update the spec status line** in
  `docs/superpowers/specs/2026-07-12-direction-aware-lighting-design.md` to
  `Status: Implemented (v1)` and commit:

```bash
git add docs/superpowers/specs/2026-07-12-direction-aware-lighting-design.md
git commit -m "Mark direction-aware lighting v1 as implemented"
```

---

## Rollback

Everything is additive and reversible: delete the two automations
(`ha_config_remove_automation`), the four helpers
(`ha_config_remove_script`-equivalent for helpers via
`ha_remove_helpers_integrations`), the dashboard card (python_transform pop),
and re-disable the four registry entities (`ha_set_entity(..., enabled=False)`).

## Known risks

- `wait_for_trigger` `timeout:` and trigger `for:` templates render at step
  execution; if HA rejects the template form on save, fall back to hardcoded
  `timeout: {seconds: 6}` / `for: "00:02:00"` and drop the two helpers from
  the automations (keep them for documentation) — note it in the spec.
- If zone 3's off-delay (default 15 s) keeps it `on` while someone lingers by
  the door, a second person leaving the bedroom won't re-fire it — acceptable
  for v1.
- A person already in the hallway when the section toggle flips on won't
  trigger until they re-enter a start zone — by design (`wait_for_trigger`
  waits for transitions).
