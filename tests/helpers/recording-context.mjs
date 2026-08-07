// A stand-in for CanvasRenderingContext2D that records what a scene draws.
//
// Scenes only ever touch a 2D context, which means they can be rendered in Node with no browser
// and no native canvas dependency. This harness does more than "not throw": it fails on the
// mistakes that actually reach a canvas silently — NaN coordinates, colours built from undefined
// values, an alpha outside 0..1, and unbalanced save/restore.

const NUMERIC_METHODS = new Set([
  'moveTo',
  'lineTo',
  'bezierCurveTo',
  'quadraticCurveTo',
  'arc',
  'arcTo',
  'rect',
  'roundRect',
  'ellipse',
  'fillRect',
  'strokeRect',
  'clearRect',
  'translate',
  'rotate',
  'scale',
  'transform',
  'setTransform',
  'createLinearGradient',
  'createRadialGradient',
  'addColorStop',
]);

const NUMERIC_PROPERTIES = new Set([
  'lineWidth',
  'globalAlpha',
  'miterLimit',
  'lineDashOffset',
  'shadowBlur',
  'shadowOffsetX',
  'shadowOffsetY',
]);

const PAINT_METHODS = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText']);

export class ContextViolation extends Error {}

export function createRecordingContext({ width = 1280, height = 720 } = {}) {
  const ops = [];
  const problems = [];
  let depth = 0;
  let maxDepth = 0;
  let paints = 0;

  const fail = (message) => {
    problems.push(message);
  };

  const checkNumbers = (name, args) => {
    args.forEach((value, i) => {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        fail(`${name}() argument ${i} is ${value}`);
      }
    });
  };

  const checkStyle = (name, value) => {
    if (typeof value !== 'string') return;
    if (/NaN|undefined|null/.test(value)) fail(`${name} set to "${value}"`);
  };

  const record = (name, args = []) => {
    // Round so float noise can't make two identical runs compare unequal.
    ops.push(
      `${name}(${args
        .map((a) => (typeof a === 'number' ? a.toFixed(4) : typeof a === 'string' ? a : typeof a))
        .join(',')})`,
    );
  };

  const method =
    (name) =>
    (...args) => {
      if (NUMERIC_METHODS.has(name)) checkNumbers(name, args);
      if (PAINT_METHODS.has(name)) paints += 1;
      record(name, args);
    };

  const gradient = (name) => (...args) => {
    checkNumbers(name, args);
    record(name, args);
    return {
      addColorStop(offset, colour) {
        checkNumbers('addColorStop', [offset]);
        checkStyle('gradient stop', colour);
        record('addColorStop', [offset, colour]);
      },
    };
  };

  const ctx = {
    canvas: { width, height },

    // Path + paint surface used by scenes.
    beginPath: method('beginPath'),
    closePath: method('closePath'),
    moveTo: method('moveTo'),
    lineTo: method('lineTo'),
    bezierCurveTo: method('bezierCurveTo'),
    quadraticCurveTo: method('quadraticCurveTo'),
    arc: method('arc'),
    arcTo: method('arcTo'),
    rect: method('rect'),
    roundRect: method('roundRect'),
    ellipse: method('ellipse'),
    fill: method('fill'),
    stroke: method('stroke'),
    clip: method('clip'),
    fillRect: method('fillRect'),
    strokeRect: method('strokeRect'),
    clearRect: method('clearRect'),
    fillText: method('fillText'),
    strokeText: method('strokeText'),
    setLineDash: method('setLineDash'),
    drawImage: method('drawImage'),
    translate: method('translate'),
    rotate: method('rotate'),
    scale: method('scale'),
    transform: method('transform'),
    setTransform: method('setTransform'),
    resetTransform: method('resetTransform'),
    measureText: (text) => {
      record('measureText', [text]);
      return { width: String(text).length * 8 };
    },
    createLinearGradient: gradient('createLinearGradient'),
    createRadialGradient: gradient('createRadialGradient'),
    createPattern: () => {
      record('createPattern');
      return null;
    },

    save() {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
      record('save');
    },
    restore() {
      if (depth === 0) fail('restore() with no matching save()');
      else depth -= 1;
      record('restore');
    },
  };

  // Style properties: recorded, and validated on the way in.
  for (const name of [
    'fillStyle',
    'strokeStyle',
    'lineWidth',
    'lineCap',
    'lineJoin',
    'miterLimit',
    'globalAlpha',
    'globalCompositeOperation',
    'font',
    'textAlign',
    'textBaseline',
    'filter',
    'lineDashOffset',
    'shadowBlur',
    'shadowColor',
    'shadowOffsetX',
    'shadowOffsetY',
    'imageSmoothingEnabled',
  ]) {
    let stored = null;
    Object.defineProperty(ctx, name, {
      enumerable: true,
      get: () => stored,
      set(value) {
        if (NUMERIC_PROPERTIES.has(name) && typeof value === 'number' && !Number.isFinite(value)) {
          fail(`${name} set to ${value}`);
        }
        if (name === 'globalAlpha' && typeof value === 'number' && (value < 0 || value > 1)) {
          fail(`globalAlpha set to ${value} (outside 0..1)`);
        }
        checkStyle(name, value);
        stored = value;
        record(`set:${name}`, [value]);
      },
    });
  }

  return {
    ctx,
    get ops() {
      return ops;
    },
    get paints() {
      return paints;
    },
    get depth() {
      return depth;
    },
    get maxDepth() {
      return maxDepth;
    },
    get problems() {
      return problems;
    },
    /** Stable string for comparing two runs. */
    fingerprint: () => ops.join('\n'),
    /** Throw if anything invalid reached the context. */
    assertClean(label = 'context') {
      if (problems.length) {
        throw new ContextViolation(
          `${label}: ${problems.length} invalid canvas operation(s)\n  - ${problems
            .slice(0, 12)
            .join('\n  - ')}`,
        );
      }
    },
  };
}
