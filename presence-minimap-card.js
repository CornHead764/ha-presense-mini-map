/**
 * Presence Minimap Card
 * A custom Lovelace card that renders Everything Presence Lite sensors
 * on a floorplan SVG overlay.
 */

const CARD_VERSION = '1.0.0';

const DEFAULT_ZONE_COLORS = [
  { fill: 'rgba(20,200,0,0.10)',   stroke: 'rgba(20,200,0,0.4)' },
  { fill: 'rgba(200,0,255,0.10)',  stroke: 'rgba(200,0,255,0.4)' },
  { fill: 'rgba(200,120,55,0.10)', stroke: 'rgba(200,120,55,0.4)' },
  { fill: 'rgba(255,0,0,0.15)',    stroke: 'rgba(255,0,0,0.4)' },
];

const DEFAULT_MASK_COLOR = { fill: 'rgba(20,20,20,0.12)', stroke: 'rgba(20,20,20,0.3)' };
const DEFAULT_COVERAGE_COLOR = { fill: 'rgba(168,216,234,0.25)', stroke: 'rgba(168,216,234,0.6)' };

// Parse a color input into { fill, stroke }.
// Accepts:
//   - hex string: '#03a9f4'
//   - object: { fill: '...', stroke: '...' }
//   - rgba/rgb string used for both fill and stroke
// fillAlpha/strokeAlpha control opacity when converting from hex.
function parseOverlayColor(input, fillAlpha = 0.25, strokeAlpha = 0.6) {
  if (!input) return null;
  if (typeof input === 'object' && input.fill && input.stroke) return input;
  const str = String(input).trim();
  const hex = str.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let r, g, b;
    const h = hex[1];
    if (h.length === 3) {
      r = parseInt(h[0] + h[0], 16);
      g = parseInt(h[1] + h[1], 16);
      b = parseInt(h[2] + h[2], 16);
    } else {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
    return { fill: `rgba(${r},${g},${b},${fillAlpha})`, stroke: `rgba(${r},${g},${b},${strokeAlpha})` };
  }
  return { fill: str, stroke: str };
}

const COVERAGE_STEPS = [5500, 4500, 4000, 3000, 2000, 1000, 0, -1000, -2000, -3000, -4000, -4500, -5500];

const DEFAULT_CONFIG = {
  image: '/local/floor-plan.png',
  image_width: 12192,   // 40' in mm
  image_height: 10973,  // ~36' in mm (988/889 aspect ratio * 40')
  refresh_interval: 1,
  show_targets: true,
  show_coverage: true,
  show_zones: true,
  show_occupancy_masks: true,
  show_sensor_icons: true,
  show_labels: true,
  target_size: 100,
  coverage_color: null,
  zone_colors: null,
  mask_color: null,
  sensors: [],
};

class PresenceMinimapCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    this._lastStateHash = '';
    this._pollTimer = null;
    this._svgNS = 'http://www.w3.org/2000/svg';
    this._xlinkNS = 'http://www.w3.org/1999/xlink';
  }

  static getConfigElement() {
    return undefined;
  }

  static getStubConfig() {
    return {
      image: '/local/floor-plan.png',
      image_width: 12192,
      image_height: 10973,
      sensors: [],
    };
  }

  setConfig(config) {
    if (!config) throw new Error('No configuration provided');
    this._config = { ...DEFAULT_CONFIG, ...config };
    if (!this._config.sensors || !this._config.sensors.length) {
      throw new Error('No sensors configured. Add at least one sensor to the "sensors" list.');
    }
    this._buildCard();
  }

  set hass(hass) {
    this._hass = hass;
    const hash = this._computeStateHash();
    if (hash !== this._lastStateHash) {
      this._lastStateHash = hash;
      this._render();
    }
  }

  getCardSize() {
    return 6;
  }

  connectedCallback() {
    if (this._config && this._config.refresh_interval > 0) {
      this._pollTimer = setInterval(() => {
        if (this._hass) {
          this._lastStateHash = '';
          this._render();
        }
      }, this._config.refresh_interval * 1000);
    }
  }

  disconnectedCallback() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  _computeStateHash() {
    if (!this._hass) return '';
    const parts = [];
    for (const sensor of this._config.sensors) {
      const sp = `sensor.${sensor.id}_`;
      const np = `number.${sensor.id}_`;
      for (let t = 1; t <= 3; t++) {
        const sx = this._hass.states[`${sp}target_${t}_x`];
        const sy = this._hass.states[`${sp}target_${t}_y`];
        if (sx) parts.push(sx.state);
        if (sy) parts.push(sy.state);
      }
      const ia = this._hass.states[`${np}installation_angle`];
      if (ia) parts.push(ia.state);
      const md = this._hass.states[`${np}max_distance`];
      if (md) parts.push(md.state);
      for (let z = 1; z <= 4; z++) {
        for (const coord of ['begin_x', 'begin_y', 'end_x', 'end_y']) {
          const e = this._hass.states[`${np}zone_${z}_${coord}`];
          if (e) parts.push(e.state);
        }
      }
      for (const coord of ['begin_x', 'begin_y', 'end_x', 'end_y']) {
        const e = this._hass.states[`${np}occupancy_mask_1_${coord}`];
        if (e) parts.push(e.state);
      }
    }
    return parts.join('|');
  }

  _buildCard() {
    const shadow = this.shadowRoot;
    shadow.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
      }
      .card {
        background: var(--ha-card-background, var(--card-background-color, white));
        border-radius: var(--ha-card-border-radius, 12px);
        box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,0.15));
        overflow: hidden;
        position: relative;
      }
      .card-header {
        padding: 12px 16px 4px;
        font-size: 16px;
        font-weight: 500;
        color: var(--primary-text-color, #333);
      }
      .card-content {
        padding: 4px 8px 8px;
      }
      svg {
        width: 100%;
        display: block;
      }
      .toggle-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 4px 8px 8px;
      }
      .toggle-btn {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 12px;
        border: 1px solid var(--divider-color, #ddd);
        background: var(--card-background-color, white);
        color: var(--primary-text-color, #666);
        cursor: pointer;
        user-select: none;
        transition: background 0.2s, color 0.2s;
      }
      .toggle-btn.active {
        background: var(--primary-color, #03a9f4);
        color: white;
        border-color: var(--primary-color, #03a9f4);
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .target-dot {
        animation: pulse 2s ease-in-out infinite;
      }
    `;
    shadow.appendChild(style);

    const card = document.createElement('div');
    card.className = 'card';

    if (this._config.title) {
      const header = document.createElement('div');
      header.className = 'card-header';
      header.textContent = this._config.title;
      card.appendChild(header);
    }

    const content = document.createElement('div');
    content.className = 'card-content';
    card.appendChild(content);

    const toggleBar = document.createElement('div');
    toggleBar.className = 'toggle-bar';
    card.appendChild(toggleBar);

    const layers = [
      { key: 'show_targets', label: 'Targets' },
      { key: 'show_coverage', label: 'Coverage' },
      { key: 'show_zones', label: 'Zones' },
      { key: 'show_occupancy_masks', label: 'Masks' },
      { key: 'show_sensor_icons', label: 'Sensors' },
      { key: 'show_labels', label: 'Labels' },
    ];

    for (const layer of layers) {
      const btn = document.createElement('button');
      btn.className = `toggle-btn${this._config[layer.key] ? ' active' : ''}`;
      btn.textContent = layer.label;
      btn.addEventListener('click', () => {
        this._config[layer.key] = !this._config[layer.key];
        btn.classList.toggle('active');
        this._lastStateHash = '';
        this._render();
      });
      toggleBar.appendChild(btn);
    }

    shadow.appendChild(card);
    this._contentEl = content;
  }

  _render() {
    if (!this._hass || !this._config || !this._contentEl) return;

    const cfg = this._config;
    const w = cfg.image_width;
    const h = cfg.image_height;

    const svg = document.createElementNS(this._svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (cfg.card_height) {
      svg.style.height = `${cfg.card_height}px`;
    }

    // Floorplan background
    const img = document.createElementNS(this._svgNS, 'image');
    img.setAttribute('href', cfg.image);
    img.setAttribute('x', '0');
    img.setAttribute('y', '0');
    img.setAttribute('width', String(w));
    img.setAttribute('height', String(h));
    svg.appendChild(img);

    // Create layer groups in render order (bottom to top)
    const gCoverage = document.createElementNS(this._svgNS, 'g');
    const gZones = document.createElementNS(this._svgNS, 'g');
    const gMasks = document.createElementNS(this._svgNS, 'g');
    const gTargets = document.createElementNS(this._svgNS, 'g');
    const gSensors = document.createElementNS(this._svgNS, 'g');
    const gLabels = document.createElementNS(this._svgNS, 'g');

    for (const sensor of cfg.sensors) {
      const color = sensor.color || '#4CAF50';
      const sensorPrefix = `sensor.${sensor.id}_`;
      const numberPrefix = `number.${sensor.id}_`;
      const sensorX = sensor.x || 0;
      const sensorY = sensor.y || 0;
      const floorplanRotation = sensor.rotation || 0;
      const sensorScale = sensor.scale || 1.0;
      const mirrorX = sensor.mirror_x ?? cfg.mirror_x ?? false;
      const mirrorY = sensor.mirror_y ?? cfg.mirror_y ?? false;

      // Get installation angle from HA
      const iaEntity = this._hass.states[`${numberPrefix}installation_angle`];
      const installationAngle = iaEntity ? Number(iaEntity.state) || 0 : 0;

      // Get max_distance from HA
      const mdEntity = this._hass.states[`${numberPrefix}max_distance`];
      const maxDistance = mdEntity ? Number(mdEntity.state) * 10 : 7500; // *10 to match plotly convention

      // Detect unit
      const unitEntity = this._hass.states[`${sensorPrefix}target_1_x`];
      const isInch = unitEntity && unitEntity.attributes &&
        unitEntity.attributes.unit_of_measurement === 'in';

      // Floorplan rotation constants (shared by both transforms)
      const fpRad = floorplanRotation * Math.PI / 180;
      const fpCos = Math.cos(fpRad);
      const fpSin = Math.sin(fpRad);

      // Apply mirror, scale, floorplan rotation, and translation.
      // Used for sensor-reported data (targets, zones, masks) where the
      // installation angle is already baked into the coordinates by the sensor.
      const transformData = (localX, localY) => {
        let x = mirrorX ? -localX : localX;
        let y = mirrorY ? -localY : localY;
        x *= sensorScale;
        y *= sensorScale;

        const fx = x * fpCos + y * fpSin;
        const fy = x * fpSin - y * fpCos;
        return [sensorX + fx, sensorY + fy];
      };

      // Apply mirror, scale, installation angle, floorplan rotation, and translation.
      // Used for the coverage arc, which is built geometrically from scratch
      // and needs the installation angle rotation applied explicitly.
      const transformArc = (localX, localY) => {
        let x = mirrorX ? -localX : localX;
        let y = mirrorY ? -localY : localY;
        x *= sensorScale;
        y *= sensorScale;

        const iaRad = -installationAngle * Math.PI / 180;
        const iaCos = Math.cos(iaRad);
        const iaSin = Math.sin(iaRad);
        const rx = x * iaCos + y * iaSin;
        const ry = -x * iaSin + y * iaCos;
        x = rx;
        y = ry;

        const fx = x * fpCos + y * fpSin;
        const fy = x * fpSin - y * fpCos;
        return [sensorX + fx, sensorY + fy];
      };

      // --- Coverage arc ---
      const covColor = parseOverlayColor(sensor.coverage_color, 0.25, 0.6)
        || parseOverlayColor(cfg.coverage_color, 0.25, 0.6)
        || DEFAULT_COVERAGE_COLOR;
      if (cfg.show_coverage) {
        const distanceRatio = maxDistance / 7500;

        // Build arc in sensor-local coordinates (before installation angle)
        const arcX = [0, maxDistance * Math.sin(Math.PI / 180 * 60)];
        const arcY = [0, maxDistance * Math.cos(Math.PI / 180 * 60)];

        for (const step of COVERAGE_STEPS) {
          const sx = step * distanceRatio;
          const val = maxDistance * maxDistance - sx * sx;
          arcX.push(sx);
          arcY.push(val > 0 ? Math.sqrt(val) : 0);
        }

        arcX.push(-maxDistance * Math.sin(Math.PI / 180 * 60), 0);
        arcY.push(maxDistance * Math.cos(Math.PI / 180 * 60), 0);

        // Arc is built in un-rotated sensor space; transformArc applies
        // installation angle + floorplan rotation + translation.
        const points = [];
        for (let i = 0; i < arcX.length; i++) {
          const [fx, fy] = transformArc(arcX[i], arcY[i]);
          points.push(`${fx},${fy}`);
        }

        const polygon = document.createElementNS(this._svgNS, 'polygon');
        polygon.setAttribute('points', points.join(' '));
        polygon.setAttribute('fill', covColor.fill);
        polygon.setAttribute('stroke', covColor.stroke);
        polygon.setAttribute('stroke-width', '20');
        polygon.setAttribute('stroke-dasharray', '60,40');
        gCoverage.appendChild(polygon);
      }

      // --- Zones ---
      if (cfg.show_zones) {
        // Resolve zone colors: per-sensor array > global array > defaults
        const sensorZoneColors = sensor.zone_colors || [];
        const globalZoneColors = cfg.zone_colors || [];

        for (let z = 1; z <= 4; z++) {
          const bx = this._getNumberState(`${numberPrefix}zone_${z}_begin_x`);
          const by = this._getNumberState(`${numberPrefix}zone_${z}_begin_y`);
          const ex = this._getNumberState(`${numberPrefix}zone_${z}_end_x`);
          const ey = this._getNumberState(`${numberPrefix}zone_${z}_end_y`);

          if (bx === null || by === null || ex === null || ey === null) continue;

          const corners = [
            [bx, by], [bx, ey], [ex, ey], [ex, by],
          ];
          const points = corners.map(([lx, ly]) => {
            const [fx, fy] = transformData(lx, ly);
            return `${fx},${fy}`;
          }).join(' ');

          const zoneColor = parseOverlayColor(sensorZoneColors[z - 1], 0.10, 0.4)
            || parseOverlayColor(globalZoneColors[z - 1], 0.10, 0.4)
            || DEFAULT_ZONE_COLORS[z - 1];
          const polygon = document.createElementNS(this._svgNS, 'polygon');
          polygon.setAttribute('points', points);
          polygon.setAttribute('fill', zoneColor.fill);
          polygon.setAttribute('stroke', zoneColor.stroke);
          polygon.setAttribute('stroke-width', '15');
          gZones.appendChild(polygon);
        }
      }

      // --- Occupancy masks ---
      if (cfg.show_occupancy_masks) {
        const bx = this._getNumberState(`${numberPrefix}occupancy_mask_1_begin_x`);
        const by = this._getNumberState(`${numberPrefix}occupancy_mask_1_begin_y`);
        const ex = this._getNumberState(`${numberPrefix}occupancy_mask_1_end_x`);
        const ey = this._getNumberState(`${numberPrefix}occupancy_mask_1_end_y`);

        if (bx !== null && by !== null && ex !== null && ey !== null) {
          const corners = [
            [bx, by], [bx, ey], [ex, ey], [ex, by],
          ];
          const points = corners.map(([lx, ly]) => {
            const [fx, fy] = transformData(lx, ly);
            return `${fx},${fy}`;
          }).join(' ');

          const maskColor = parseOverlayColor(sensor.mask_color, 0.12, 0.3)
            || parseOverlayColor(cfg.mask_color, 0.12, 0.3)
            || DEFAULT_MASK_COLOR;
          const polygon = document.createElementNS(this._svgNS, 'polygon');
          polygon.setAttribute('points', points);
          polygon.setAttribute('fill', maskColor.fill);
          polygon.setAttribute('stroke', maskColor.stroke);
          polygon.setAttribute('stroke-width', '15');
          gMasks.appendChild(polygon);
        }
      }

      // --- Targets ---
      if (cfg.show_targets) {
        for (let t = 1; t <= 3; t++) {
          const txEntity = this._hass.states[`${sensorPrefix}target_${t}_x`];
          const tyEntity = this._hass.states[`${sensorPrefix}target_${t}_y`];
          if (!txEntity || !tyEntity) continue;

          let tx = Number(txEntity.state);
          let ty = Number(tyEntity.state);

          if (tx === 0 && ty === 0) continue; // Inactive target

          if (isInch) {
            tx *= 25.4;
            ty *= 25.4;
          }

          const [fx, fy] = transformData(tx, ty);
          const targetSize = cfg.target_size || 100;

          // Outer glow
          const glow = document.createElementNS(this._svgNS, 'circle');
          glow.setAttribute('cx', String(fx));
          glow.setAttribute('cy', String(fy));
          glow.setAttribute('r', String(targetSize * 1.5));
          glow.setAttribute('fill', color);
          glow.setAttribute('opacity', '0.2');
          glow.classList.add('target-dot');
          gTargets.appendChild(glow);

          // Main dot
          const dot = document.createElementNS(this._svgNS, 'circle');
          dot.setAttribute('cx', String(fx));
          dot.setAttribute('cy', String(fy));
          dot.setAttribute('r', String(targetSize));
          dot.setAttribute('fill', color);
          dot.setAttribute('stroke', 'white');
          dot.setAttribute('stroke-width', '20');
          dot.setAttribute('opacity', '0.9');
          dot.classList.add('target-dot');

          // Stagger animation per target
          dot.style.animationDelay = `${(t - 1) * 0.3}s`;
          glow.style.animationDelay = `${(t - 1) * 0.3}s`;

          gTargets.appendChild(dot);

          // Target number label
          const label = document.createElementNS(this._svgNS, 'text');
          label.setAttribute('x', String(fx));
          label.setAttribute('y', String(fy));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('dominant-baseline', 'central');
          label.setAttribute('font-size', String(targetSize * 1.2));
          label.setAttribute('font-weight', 'bold');
          label.setAttribute('fill', 'white');
          label.setAttribute('pointer-events', 'none');
          label.textContent = String(t);
          gTargets.appendChild(label);
        }
      }

      // --- Sensor marker (directional triangle) ---
      if (cfg.show_sensor_icons) {
        const markerSize = 200;
        // Triangle pointing up, centered at origin, then rotated to match sensor facing
        const triPoints = [
          [0, -markerSize],                     // tip
          [-markerSize * 0.6, markerSize * 0.5], // bottom-left
          [markerSize * 0.6, markerSize * 0.5],  // bottom-right
        ];

        const totalAngle = floorplanRotation;
        const rad = totalAngle * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const pts = triPoints.map(([px, py]) => {
          const rx = px * cos - py * sin + sensorX;
          const ry = px * sin + py * cos + sensorY;
          return `${rx},${ry}`;
        }).join(' ');

        const tri = document.createElementNS(this._svgNS, 'polygon');
        tri.setAttribute('points', pts);
        tri.setAttribute('fill', color);
        tri.setAttribute('stroke', 'white');
        tri.setAttribute('stroke-width', '25');
        tri.setAttribute('opacity', '0.85');
        gSensors.appendChild(tri);

        // Small circle at sensor origin
        const originDot = document.createElementNS(this._svgNS, 'circle');
        originDot.setAttribute('cx', String(sensorX));
        originDot.setAttribute('cy', String(sensorY));
        originDot.setAttribute('r', '60');
        originDot.setAttribute('fill', 'white');
        originDot.setAttribute('stroke', color);
        originDot.setAttribute('stroke-width', '20');
        gSensors.appendChild(originDot);
      }

      // --- Labels ---
      if (cfg.show_labels) {
        const name = sensor.name || sensor.id;
        const labelOffset = 320;

        const text = document.createElementNS(this._svgNS, 'text');
        text.setAttribute('x', String(sensorX));
        text.setAttribute('y', String(sensorY + labelOffset));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '160');
        text.setAttribute('font-weight', '600');
        text.setAttribute('fill', color);
        text.setAttribute('stroke', 'var(--ha-card-background, white)');
        text.setAttribute('stroke-width', '40');
        text.setAttribute('paint-order', 'stroke');
        text.textContent = name;
        gLabels.appendChild(text);
      }
    }

    // Append layers in order
    svg.appendChild(gCoverage);
    svg.appendChild(gZones);
    svg.appendChild(gMasks);
    svg.appendChild(gTargets);
    svg.appendChild(gSensors);
    svg.appendChild(gLabels);

    this._contentEl.innerHTML = '';
    this._contentEl.appendChild(svg);
  }

  _getNumberState(entityId) {
    const entity = this._hass.states[entityId];
    if (!entity) return null;
    const val = Number(entity.state);
    if (isNaN(val)) return null;
    return val;
  }
}

customElements.define('presence-minimap-card', PresenceMinimapCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'presence-minimap-card',
  name: 'Presence Minimap Card',
  description: 'Renders Everything Presence Lite sensors on a floorplan overlay',
  preview: false,
});

console.info(
  `%c PRESENCE-MINIMAP-CARD %c v${CARD_VERSION} `,
  'color: white; background: #4CAF50; font-weight: bold; padding: 2px 4px; border-radius: 4px 0 0 4px;',
  'color: #4CAF50; background: white; font-weight: bold; padding: 2px 4px; border-radius: 0 4px 4px 0; border: 1px solid #4CAF50;'
);
