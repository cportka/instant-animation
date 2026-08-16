// The panel: the only control on this page that is not a chevron.
//
// The gallery's whole premise is that the animation *is* the interface, so a rack of sliders needs a
// justification. This is it: the scenes are parameterised to an absurd degree — a pit's palette is
// spaced by an exponent, a storm's march is a coefficient on two sine waves, a one-bit train's
// density is one number — and every one of those numbers was chosen by somebody looking at the
// picture and deciding. The panel hands that over. It is summoned, used, and dismissed; at rest
// there is nothing on the page at all.
//
// **Colour and nothing else.** A knob has no label, no number, no tooltip and no units, and that is
// not minimalism for its own sake — the things these move do not have names anybody would recognise.
// "Crowd" is an exponent on a palette-step boundary. What a knob does is visible in the picture the
// instant you move it, which is a better label than any word, and it is the only label that stays
// true when the same knob is wired to four different parameters. The colour is the identity: the
// same swatch is the same gesture every time you open the panel.
//
// The accessible name is a different question and is answered separately — every knob carries an
// `aria-label`, because "look at what changes" is not available to everybody.

const KEY_STEP = 0.05;
const PAGE_STEP = 0.2;

/** Turn a knob's id into the name a screen reader will read out. Never shown. */
const nameOf = (id) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Build the panel once and drive it.
 *
 * @param {HTMLElement} root      the container in the markup
 * @param {HTMLElement} reset     the black button, also in the markup
 * @param {() => void} onChange   called after any value moves, so the caller can repaint a still frame
 */
export function createPanel(root, reset, onChange) {
  /** @type {{ id: string, el: HTMLElement, fill: HTMLElement }[]} */
  let dials = [];
  let values = null;
  let open = false;

  const write = (dial, at) => {
    values[dial.id] = at;
    dial.fill.style.height = `${(at * 100).toFixed(2)}%`;
    dial.el.setAttribute('aria-valuenow', Math.round(at * 100));
  };

  const nudge = (dial, by) => {
    write(dial, Math.min(1, Math.max(0, values[dial.id] + by)));
    onChange();
  };

  /** Where a pointer is in the track, as 0 at the bottom and 1 at the top. */
  const readPointer = (dial, event) => {
    const box = dial.el.getBoundingClientRect();
    const at = box.height > 0 ? (box.bottom - event.clientY) / box.height : 0;
    write(dial, Math.min(1, Math.max(0, at)));
    onChange();
  };

  /**
   * Re-stock the panel for a scene. Knobs belong to the artwork, so the rack is rebuilt whenever the
   * artwork changes — and the *values* come from the caller, which is what lets a visitor's settings
   * survive travelling away from a scene and coming back to it.
   */
  function stock(meta, bag) {
    values = bag;
    dials = [];
    root.replaceChildren();
    for (const knob of meta.knobs ?? []) {
      const el = document.createElement('div');
      el.className = 'knob';
      el.tabIndex = 0;
      el.setAttribute('role', 'slider');
      el.setAttribute('aria-label', nameOf(knob.id));
      el.setAttribute('aria-valuemin', '0');
      el.setAttribute('aria-valuemax', '100');
      // The colour *is* the label, so it is set here rather than in the stylesheet: a scene declares
      // its own, and a rule per knob per scene in the CSS would be a second place to keep them.
      el.style.setProperty('--knob', knob.colour);

      const fill = document.createElement('div');
      fill.className = 'knob__fill';
      el.append(fill);
      root.append(el);

      const dial = { id: knob.id, el, fill };
      dials.push(dial);
      write(dial, values[knob.id] ?? 0.5);

      el.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        el.setPointerCapture?.(event.pointerId);
        el.focus();
        readPointer(dial, event);
      });
      el.addEventListener('pointermove', (event) => {
        // Only while dragging. `pointermove` fires on hover too, and a knob that follows an
        // uninvited cursor is a picture that changes because you walked past it.
        if (el.hasPointerCapture?.(event.pointerId)) readPointer(dial, event);
      });
      el.addEventListener('keydown', (event) => {
        const by = { ArrowUp: KEY_STEP, ArrowRight: KEY_STEP, ArrowDown: -KEY_STEP, ArrowLeft: -KEY_STEP,
          PageUp: PAGE_STEP, PageDown: -PAGE_STEP, Home: -1, End: 1 }[event.key];
        if (by === undefined) return;
        // Swallowed *here* rather than in the shell: while the panel is open these keys belong to
        // whichever knob is focused, and the gallery must not travel underneath it.
        event.preventDefault();
        event.stopPropagation();
        nudge(dial, by);
      });
    }
  }

  /** Hand the keyboard back to the page if it is still inside the rack. */
  const release = () => {
    const focused = document.activeElement;
    if (focused && root.parentElement.contains(focused)) focused.blur();
  };

  reset.addEventListener('click', () => {
    for (const dial of dials) write(dial, 0.5);
    onChange();
  });

  return {
    stock,
    get open() {
      return open;
    },
    toggle() {
      open = !open;
      root.parentElement.hidden = !open;
      // Focus the first knob on opening, so the keyboard route does not need a pointer to start it —
      // and **give it back on closing**, which is not symmetry for its own sake. A knob swallows the
      // arrow keys while it has focus, so a rack dismissed with a knob still focused leaves the
      // gallery unable to move: the panel is gone, the arrows do nothing, and there is nothing on
      // screen to explain why.
      if (open) dials[0]?.el.focus();
      else release();
      return open;
    },
    close() {
      if (!open) return;
      open = false;
      root.parentElement.hidden = true;
      release();
    },
  };
}
