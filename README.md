# Presence Minimap Card

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/your-username/presence-minimap-card/releases)
[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz)

A custom Home Assistant Lovelace card that renders [Everything Presence Lite](https://shop.everythingsmart.technology/en-us/products/everything-presence-lite) sensors on a floorplan overlay. See all your presence targets, detection zones, coverage arcs, and occupancy masks on a single map in real time.

## Features

- **Floorplan overlay** -- SVG rendering with your floorplan image as the background
- **Real-time targets** -- Up to 3 targets per sensor shown as pulsing colored dots
- **Coverage arcs** -- 60-degree FOV fan matching each sensor's max distance and installation angle
- **Zones** -- Up to 4 zones per sensor rendered as rotated rectangles with color coding
- **Occupancy masks** -- Dark overlay rectangles showing masked-out areas
- **Sensor markers** -- Directional triangles showing each sensor's position and facing direction
- **Labels** -- Stroke-outlined sensor names for readability on any background
- **Toggle buttons** -- Enable/disable each layer independently from the card UI
- **Unit auto-detection** -- Automatically converts inches to millimeters
- **No dependencies** -- Single JS file, no build step, no external libraries

## Installation

### HACS (recommended)

1. In HACS, go to **Frontend** > three-dot menu > **Custom repositories**
2. Add this repository URL with category **Lovelace**
3. Install **Presence Minimap Card** from HACS
4. Copy your `floor-plan.png` to your HA `config/www/` directory
5. Restart Home Assistant

### Manual

1. Copy `presence-minimap-card.js` to your HA `config/www/` directory
2. Copy your `floor-plan.png` to the same `config/www/` directory
3. Go to **Settings > Dashboards > Resources** and add `/local/presence-minimap-card.js` as a **JavaScript Module**
4. Restart Home Assistant

## Configuration

Add the card to a dashboard using the YAML editor. See `example-config.yaml` for a full example.

### Minimal example

```yaml
type: custom:presence-minimap-card
title: Presence Map
image: /local/floor-plan.png
image_width: 12192
image_height: 10973
sensors:
  - id: epl_living_room
    name: "Living Room"
    x: 6000
    y: 4000
    rotation: 180
    color: '#4CAF50'
```

### Card options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `image` | string | `/local/floor-plan.png` | Path to the floorplan image |
| `image_width` | number | `12192` | Floorplan width in mm |
| `image_height` | number | `10973` | Floorplan height in mm |
| `card_height` | number | _(auto)_ | Fixed card height in pixels. If omitted, the card auto-sizes to fill its container width |
| `title` | string | _(none)_ | Card title displayed above the map |
| `refresh_interval` | number | `1` | Fallback polling interval in seconds |
| `show_targets` | bool | `true` | Show target dots |
| `show_coverage` | bool | `true` | Show coverage arcs |
| `show_zones` | bool | `true` | Show detection zones |
| `show_occupancy_masks` | bool | `true` | Show occupancy mask rectangles |
| `show_sensor_icons` | bool | `true` | Show sensor position markers |
| `show_labels` | bool | `true` | Show sensor name labels |
| `target_size` | number | `100` | Target dot radius in mm (SVG units) |
| `coverage_color` | string | light blue | Global coverage arc color. Accepts hex (`#03a9f4`), rgba, or `{ fill, stroke }` object |
| `zone_colors` | list | green, magenta, orange, red | Array of up to 4 colors for zones 1-4. Each entry accepts hex, rgba, or `{ fill, stroke }` |
| `mask_color` | string | dark gray | Global occupancy mask color. Accepts hex, rgba, or `{ fill, stroke }` |
| `mirror_x` | bool | `false` | Global default: flip sensor X axis (left/right). Useful for upside-down mounted sensors |
| `mirror_y` | bool | `false` | Global default: flip sensor Y axis (forward/backward). Useful for upside-down mounted sensors |
| `sensors` | list | _(required)_ | List of sensor configurations (see below) |

### Sensor options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | string | _(required)_ | Sensor entity ID prefix (e.g. `epl_living_room` or `everything_presence_lite_abc123`) |
| `name` | string | _(id)_ | Display name for the sensor label |
| `x` | number | `0` | Sensor X position on floorplan (mm from left edge) |
| `y` | number | `0` | Sensor Y position on floorplan (mm from top edge) |
| `rotation` | number | `0` | Direction the sensor faces on the floorplan: `0`=up, `90`=right, `180`=down, `270`=left |
| `scale` | number | `1.0` | Multiplier for this sensor's coordinates. Adjust if targets appear too close or too far |
| `color` | string | `#4CAF50` | Theme color for this sensor's overlays |
| `coverage_color` | string | _(global)_ | Override coverage arc color for this sensor |
| `zone_colors` | list | _(global)_ | Override zone colors for this sensor (array of up to 4) |
| `mask_color` | string | _(global)_ | Override occupancy mask color for this sensor |
| `mirror_x` | bool | _(global)_ | Flip this sensor's X axis (left/right) |
| `mirror_y` | bool | _(global)_ | Flip this sensor's Y axis (forward/backward) |

### Customizing overlay colors

All overlay colors accept a hex string, an rgba string, or an object with explicit `fill` and `stroke`:

```yaml
type: custom:presence-minimap-card
image: /local/floor-plan.png
image_width: 12192
image_height: 10973

# Global overlay colors (apply to all sensors)
coverage_color: '#ff6600'
mask_color: '#555555'
zone_colors:
  - '#00ff00'        # Zone 1
  - '#ff00ff'        # Zone 2
  - '#ffaa00'        # Zone 3
  - '#ff0000'        # Zone 4

sensors:
  - id: epl_living_room
    name: "Living Room"
    x: 6000
    y: 4000
    rotation: 180
    color: '#4CAF50'
    # Per-sensor overrides
    coverage_color: '#00ccff'
    mask_color:
      fill: 'rgba(255,0,0,0.3)'
      stroke: 'rgba(255,0,0,0.6)'
```

When using a hex string, the card auto-generates fill and stroke opacities appropriate for each layer type (lighter fill, stronger stroke).

### Finding your sensor ID

The `id` field is the entity ID prefix used by your Everything Presence Lite sensor. You can find it by looking at your sensor entities in Home Assistant:

- If you see `sensor.epl_living_room_target_1_x`, the ID is `epl_living_room`
- If you see `sensor.everything_presence_lite_5ccc2c_target_1_x`, the ID is `everything_presence_lite_5ccc2c`

### Setting `image_width` and `image_height`

These values define the SVG coordinate space in millimeters. They should match the real-world dimensions of the area shown in your floorplan image.

For example, if your floorplan shows a 40' x 36' area:
- `image_width`: 40 x 304.8 = **12192**
- `image_height`: 36 x 304.8 = **10973**

## Coordinate system

All coordinates are in **millimeters**. The card applies transforms to map sensor-local coordinates onto the floorplan:

1. **Mirror** (optional) -- flips X and/or Y axis for upside-down mounted sensors
2. **Scale** -- multiplies sensor coordinates by the per-sensor `scale` factor
3. **Floorplan rotation + translation** -- rotates the sensor's "forward" direction to match `rotation` on the floorplan, then translates to the sensor's `x`/`y` position

The sensor's `installation_angle` entity is read automatically and applied to the coverage arc rendering.

## Calibration

1. Start with `show_coverage: true` and `show_sensor_icons: true` to see sensor positions and detection fans
2. Adjust `x` and `y` values until sensor markers align with the actual wall-mount locations on your floorplan
3. Adjust `rotation` values until coverage fans point into the correct rooms
4. Walk in front of sensors and verify target dots appear in the correct rooms
5. Adjust `scale` if targets appear consistently too close or too far from the sensor
6. If targets appear mirrored/flipped (e.g., upside-down mounted sensors), use `mirror_x` and/or `mirror_y`

## Entity requirements

The card reads the following entities per sensor (where `{id}` is the sensor ID prefix):

**Targets** (sensor domain):
- `sensor.{id}_target_1_x`, `sensor.{id}_target_1_y`
- `sensor.{id}_target_2_x`, `sensor.{id}_target_2_y`
- `sensor.{id}_target_3_x`, `sensor.{id}_target_3_y`

**Zones** (number domain, zones 2-4 are optional):
- `number.{id}_zone_{1-4}_begin_x`, `number.{id}_zone_{1-4}_begin_y`
- `number.{id}_zone_{1-4}_end_x`, `number.{id}_zone_{1-4}_end_y`

**Occupancy mask** (number domain, optional):
- `number.{id}_occupancy_mask_1_begin_x`, `number.{id}_occupancy_mask_1_begin_y`
- `number.{id}_occupancy_mask_1_end_x`, `number.{id}_occupancy_mask_1_end_y`

**Sensor settings** (number domain):
- `number.{id}_installation_angle`
- `number.{id}_max_distance`

## License

MIT
