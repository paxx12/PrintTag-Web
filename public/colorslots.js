// One color picker for all colors: a row of color buttons picks which color
// the picker edits, and "+" adds the next color. The original color fields
// stay in the page (only one is shown at a time), so reading, writing and
// saving tags keep working through them unchanged.
//
// Works with both color layouts:
//  - one "Additional Colors" checkbox for colors 2-4 (white = unused)
//  - a checkbox per extra color (colorEnable2..N)

const ColorSlots = {
    active: 1,       // color the picker is editing
    count: 1,        // colors in use (single-checkbox layout only)
    root: null,
    actions: null,
    busy: false,     // ignore our own calls into app while changing colors
    refocus: false,  // put keyboard focus back on the active button after render
    layout: '',      // last button layout drawn (count|max|active)
    touched: new Set(), // colors whose hex box was left, so errors can show

    perColor() { return !!document.getElementById('colorEnable2'); },

    group(i) {
        if (i === 1) {
            const el = document.getElementById('colorHex1');
            return el && el.closest('.form-group');
        }
        return document.querySelector(`.form-group[data-field="colorHex${i}"]`);
    },

    // Colors the current format can hold
    max() {
        let n = 1;
        while (document.getElementById(`colorHex${n + 1}`)) {
            const g = this.group(n + 1);
            if (!g || g.classList.contains('hidden')) break;
            n++;
        }
        return n;
    },

    // Colors in use
    used() {
        if (this.perColor()) {
            let n = 1;
            while (document.getElementById(`colorEnable${n + 1}`) && document.getElementById(`colorEnable${n + 1}`).checked) n++;
            return n;
        }
        return this.count;
    },

    // Single-checkbox layout: colors in use, from the values (white = unused)
    countFromValues() {
        const box = document.getElementById('showAdditionalColors');
        if (!box || !box.checked) return 1;
        let n = 1;
        for (let i = 2; document.getElementById(`colorHex${i}`); i++) {
            const v = document.getElementById(`colorHex${i}`).value.replace('#', '').toUpperCase();
            if (/^[0-9A-F]{6}$/.test(v) && v !== 'FFFFFF') n = i;
        }
        return n;
    },

    hex(i) {
        const v = (document.getElementById(`colorHex${i}`).value || '').replace('#', '').toUpperCase();
        return /^[0-9A-F]{6}$/.test(v) ? v : 'FFFFFF';
    },

    setHex(i, v) {
        document.getElementById(`colorHex${i}`).value = v;
        app.updateColor('#' + v, i);
    },

    setAdditional(on) {
        const box = document.getElementById('showAdditionalColors');
        if (!box) return;
        box.checked = on;
        app.toggleAdditionalColors(on);
    },

    select(i) {
        this.expandAll();
        this.active = i;
        this.render();
    },

    add() {
        const n = this.used() + 1;
        if (n > this.max()) return;
        this.expandAll();
        this.busy = true;
        // Start from the previous color, so similar shades are a nudge away
        this.setHex(n, this.hex(n - 1));
        if (this.perColor()) {
            app.setColorEnabled(n, true);
        } else {
            this.count = n;
            this.setAdditional(true);
        }
        this.busy = false;
        this.active = n;
        app.updateRecordSize();
        this.render();
    },

    // Remove color k (any color, while there's more than one); later
    // colors move down one
    remove(k) {
        const n = this.used();
        if (n < 2 || k < 1 || k > n) return;
        if (!confirm(`Remove Color ${k} (#${this.hex(k)})?`)) return;
        this.busy = true;
        for (let j = k; j < n; j++) this.setHex(j, this.hex(j + 1));
        this.setHex(n, 'FFFFFF');
        if (this.perColor()) {
            app.setColorEnabled(n, false);
        } else {
            this.count = n - 1;
            if (this.count === 1) this.setAdditional(false);
        }
        this.busy = false;
        this.touched.clear();
        this.active = Math.min(k, n - 1);
        app.updateRecordSize();
        this.render();
    },

    // Swap color k with its neighbour (dir -1 = left, +1 = right)
    move(k, dir) {
        const j = k + dir;
        if (j < 1 || j > this.used()) return;
        this.expandAll();
        const a = this.hex(k), b = this.hex(j);
        this.setHex(k, b);
        this.setHex(j, a);
        this.active = j;
        app.updateRecordSize();
        this.render();
    },

    // Make a div act like a button for the keyboard too, like the palettes
    button(el, label, fn) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', label);
        el.addEventListener('click', fn);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.refocus = true;
                fn();
            }
        });
    },

    // Hex boxes: keep only hex digits, upper case, at most 6. Runs before
    // the app's own input handling, and keeps the cursor where it was.
    // Pull a color code out of pasted text: the first stand-alone run of 3, 6
    // or 8 hex digits (8 = with alpha, which is dropped; 3 is expanded to 6,
    // since a paste is complete). Handles "##FF5733", "0xFF5733",
    // " #ff5733cc ", "Color: #FF5733", "#abc" and the like.
    extractCode(text) {
        const m = String(text || '').match(/(?<![0-9a-f])([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/i);
        if (!m) return null;
        const code = m[1].toUpperCase();
        return code.length === 3 ? code.split('').map(c => c + c).join('') : code.slice(0, 6);
    },

    // Put a pasted code in the box (replacing what was there) and tell the app
    pasteCode(el, code) {
        el.value = code;
        try { el.setSelectionRange(code.length, code.length); } catch (e) { /* not focused */ }
        el.dispatchEvent(new Event('input', { bubbles: true }));
    },

    cleanHex(el) {
        const raw = el.value;
        const clean = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase().slice(0, 6);
        if (clean === raw) return;
        const caret = el.selectionStart == null ? raw.length : el.selectionStart;
        const before = raw.slice(0, caret).replace(/[^0-9a-fA-F]/g, '').length;
        el.value = clean;
        const pos = Math.min(before, clean.length);
        try { el.setSelectionRange(pos, pos); } catch (e) { /* not focused */ }
    },

    // --- Hex validation: 3 digits expand to 6; anything else but 6 is an error

    // Colors that count right now
    inUse() { return Math.min(this.used(), this.max()); },

    // "F53" -> "FF5533" (in the box, and tell the app)
    expand(i) {
        const el = document.getElementById(`colorHex${i}`);
        if (!el || !/^[0-9A-F]{3}$/i.test(el.value)) return;
        el.value = el.value.toUpperCase().split('').map(c => c + c).join('');
        el.dispatchEvent(new Event('input', { bubbles: true }));
    },

    expandAll() {
        for (let i = 1; i <= this.inUse(); i++) this.expand(i);
    },

    // 6 digits, or 3 (expanded when the box is left or before writing/saving)
    isValid(i) {
        const el = document.getElementById(`colorHex${i}`);
        return !el || /^([0-9A-F]{3}|[0-9A-F]{6})$/i.test(el.value);
    },

    invalid() {
        const bad = [];
        for (let i = 1; i <= this.inUse(); i++) if (!this.isValid(i)) bad.push(i);
        return bad;
    },

    // Red box + message under each bad color that's been left (or checked),
    // and a red outline on its button
    showErrors() {
        for (let i = 1; document.getElementById(`colorHex${i}`); i++) {
            const el = document.getElementById(`colorHex${i}`);
            const bad = i <= this.inUse() && this.touched.has(i) && !this.isValid(i);
            el.classList.toggle('cs-invalid', bad);
            el.setAttribute('aria-invalid', bad ? 'true' : 'false');
            const msg = this.errorEl(i);
            if (msg) msg.classList.toggle('cs-hidden', !bad);
        }
        if (!this.root) return;
        this.root.querySelectorAll('.cs-slot[data-index]').forEach(b => {
            const i = +b.dataset.index;
            b.classList.toggle('cs-bad', this.touched.has(i) && !this.isValid(i));
        });
    },

    // The error message element under color i's hex box (made on first use)
    errorEl(i) {
        let msg = document.getElementById(`colorHexError${i}`);
        if (msg) return msg;
        const el = document.getElementById(`colorHex${i}`);
        const row = el && el.parentElement;
        if (!row) return null;
        msg = document.createElement('small');
        msg.id = `colorHexError${i}`;
        msg.className = 'cs-error cs-hidden';
        msg.textContent = 'Not a valid color: use 3 or 6 hex digits';
        row.insertAdjacentElement('afterend', msg);
        return msg;
    },

    // Before writing, downloading or saving: expand short codes, and stop
    // (pointing at the first bad color) if any color isn't valid
    check(what) {
        this.expandAll();
        const bad = this.invalid();
        for (let i = 1; i <= this.inUse(); i++) this.touched.add(i);
        this.showErrors();
        if (!bad.length) return true;
        const i = bad[0];
        if (this.root && !this.root.classList.contains('cs-hidden')) this.select(i);
        const el = document.getElementById(`colorHex${i}`);
        if (el && el.offsetParent !== null) {
            el.focus();
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        const which = bad.length === 1 ? `Color ${i} isn't` : `Colors ${bad.join(', ')} aren't`;
        app.showStatus('writeStatus', 'error', `${which} a valid hex code, so nothing was ${what}. Use 3 or 6 digits.`);
        return false;
    },

    // Run check() before an app (or saved colors) action; skip the action if it fails
    guard(obj, name, what) {
        const original = obj && obj[name];
        if (typeof original !== 'function') return;
        const self = this;
        obj[name] = function (...args) {
            if (!self.check(what)) return;
            return original.apply(this, args);
        };
    },

    // Update just the button colors (called while dragging the picker)
    // What to show for color i: its color (3 digits shown expanded), or a
    // red-striped "not a color" pattern while the code isn't valid
    swatch(i) {
        const el = document.getElementById(`colorHex${i}`);
        const v = el ? el.value.replace('#', '') : '';
        if (/^[0-9A-F]{6}$/i.test(v)) return '#' + v;
        if (/^[0-9A-F]{3}$/i.test(v)) return '#' + v.split('').map(c => c + c).join('');
        return 'repeating-linear-gradient(45deg, rgba(231, 76, 60, 0.6) 0 5px, transparent 5px 10px)';
    },

    paint() {
        // The preview boxes next to the hex codes (the browser would otherwise
        // show e.g. "C039" as a see-through color)
        for (let i = 1; document.getElementById(`colorHex${i}`); i++) {
            const preview = document.getElementById(`colorPreview${i}`);
            if (preview) preview.style.background = this.swatch(i);
        }
        if (!this.root) return;
        this.root.querySelectorAll('.cs-slot[data-index]').forEach(el => {
            el.querySelector('.cs-sw').style.background = this.swatch(+el.dataset.index);
        });
    },

    render() {
        if (!this.root) return;
        const max = this.max();
        const on = max > 1;
        document.body.classList.toggle('cs-on', on);
        this.root.classList.toggle('cs-hidden', !on);
        const n = Math.min(this.used(), max);
        if (this.active > n) this.active = n;

        // Show only the color being edited
        for (let i = 1; document.getElementById(`colorHex${i}`); i++) {
            const g = this.group(i);
            if (!g) continue;
            g.classList.add('cs-group');
            g.classList.toggle('cs-hidden', on && i !== this.active);
        }

        const grid = this.root.querySelector('.cs-grid');
        // Rebuild the buttons only when they change: rebuilding mid-tap (e.g.
        // when leaving a hex box updates the page) would swallow the tap
        const layout = `${n}|${max}|${this.active}`;
        if (layout !== this.layout || !grid.children.length) {
            this.layout = layout;
            grid.innerHTML = '';
            for (let i = 1; i <= n; i++) {
                const b = document.createElement('div');
                b.className = 'material-swatch cs-slot' + (i === this.active ? ' cs-active' : '');
                b.dataset.index = i;
                if (i === this.active) b.setAttribute('aria-pressed', 'true');
                b.innerHTML = '<span class="cs-sw"></span><span class="cs-num"></span>';
                b.querySelector('.cs-num').textContent = i;
                this.button(b, `Color ${i}`, () => this.select(i));
                grid.appendChild(b);
            }
            if (n < max) {
                const plus = document.createElement('div');
                plus.className = 'material-swatch cs-slot cs-add';
                plus.textContent = '+';
                this.button(plus, `Add color ${n + 1}`, () => this.add());
                grid.appendChild(plus);
            }
        }
        this.paint();
        // After a keyboard press, keep focus on the color being edited
        if (this.refocus) {
            this.refocus = false;
            const el = grid.querySelector(`.cs-slot[data-index="${this.active}"]`);
            if (el) el.focus();
        }

        // Same one-line hint for every color, so the picker doesn't jump
        document.querySelectorAll('.cs-hint').forEach(el => {
            el.textContent = on ? 'Hold and drag on the picker, or type a hex code' : el.dataset.csText;
        });

        const editing = this.root.querySelector('.cs-editing span');
        editing.textContent = this.active === 1 ? 'Color 1 (Primary)' : `Color ${this.active}`;

        // Move/Remove buttons under the picker, while there's more than one color
        const g = this.group(this.active);
        if (on && n > 1 && g) {
            g.insertAdjacentElement('afterend', this.actions);
            this.actions.querySelector('.cs-left').disabled = this.active === 1;
            this.actions.querySelector('.cs-right').disabled = this.active === n;
            this.actions.querySelector('.cs-remove').textContent = `🗑 Remove Color ${this.active}`;
            this.actions.classList.remove('cs-hidden');
        } else {
            this.actions.classList.add('cs-hidden');
        }
        this.followSavedColors();
        this.showErrors();

        // Canvases that were hidden need resizing to their real width
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    },

    // When a saved color hides the pickers, hide the buttons too
    followSavedColors() {
        const g1 = this.group(1);
        const hidden = !!(g1 && g1.classList.contains('saved-color-hidden'));
        this.root.classList.toggle('cs-saved-hidden', hidden);
        this.actions.classList.toggle('cs-saved-hidden', hidden);
    },

    wrap(name, after) {
        const original = app[name];
        if (typeof original !== 'function') return;
        app[name] = function (...args) {
            const result = original.apply(this, args);
            after(args);
            return result;
        };
    },

    init() {
        const g1 = this.group(1);
        if (!g1) return;

        const style = document.createElement('style');
        style.textContent = `
            .cs-hidden, .cs-saved-hidden { display: none !important; }
            body.cs-on .cs-group > label { display: none !important; }
            body.cs-on .cs-group { margin-bottom: 0.5rem; }
            body.cs-on #showAdditionalColors { display: none; }
            body.cs-on .cs-extra-hint { display: none !important; }
            #colorSlots { margin-bottom: 0.5rem; }
            body.cs-on .cs-hint { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            input.cs-invalid { border-color: #e74c3c !important; box-shadow: 0 0 0 1px #e74c3c; }
            .cs-error { display: block; color: #e74c3c; font-size: 0.8rem; margin-top: 0.25rem; }
            #colorSlots .cs-slot.cs-bad, #colorSlots .cs-slot.cs-bad.cs-active { border-color: #e74c3c; }
            #colorSlots .cs-slot.cs-bad.cs-active { box-shadow: 0 0 0 2px rgba(231, 76, 60, 0.35); }
            #colorSlots .cs-slot.cs-bad .cs-num, #colorSlots .cs-slot.cs-bad.cs-active .cs-num { color: #e74c3c; }
            body.cs-on .cs-group [id^="colorFields"] { margin-top: 0 !important; }
            #colorSlots .cs-grid { margin-bottom: 0.5rem; }
            #colorSlots .cs-slot { flex-direction: column; align-items: stretch; justify-content: flex-end; gap: 0.2rem; padding: 0.3rem; min-height: 58px; font-weight: 700; }
            #colorSlots .cs-sw { flex: 1; min-height: 26px; border-radius: 3px; border: 1px solid rgba(255, 255, 255, 0.25); }
            #colorSlots .cs-num { text-align: center; line-height: 1; font-size: 0.8rem; }
            #colorSlots .cs-slot.cs-active { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(255, 107, 53, 0.35); }
            #colorSlots .cs-slot.cs-active .cs-num { color: var(--accent); }
            #colorSlots .cs-add { justify-content: center; align-items: center; border-style: dashed; font-size: 1.4rem; font-weight: 400; color: var(--text-secondary); }
            #colorSlots .cs-editing { font-size: 0.85rem; font-weight: 600; margin-bottom: 0; }
            #colorSlots .cs-editing span { color: var(--accent); }
            #colorSlotsActions { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 1rem; }
            #colorSlotsActions button { width: auto; margin: 0; padding: 0.3rem 0.6rem; font-size: 0.8rem; }
            #colorSlotsActions button:disabled { opacity: 0.35; }
        `;
        document.head.appendChild(style);

        this.root = document.createElement('div');
        this.root.id = 'colorSlots';
        this.root.className = 'form-group';
        this.root.innerHTML = '<label>Colors</label><div class="material-palette cs-grid"></div><div class="cs-editing">Editing <span></span></div>';
        this.actions = document.createElement('div');
        this.actions.id = 'colorSlotsActions';
        // Remove first and the moves always present (greyed out when they
        // can't be used), so no button slides under a repeated tap
        this.actions.innerHTML = '<button type="button" class="btn-secondary cs-remove"></button>'
            + '<button type="button" class="btn-secondary cs-left">◀ Move left</button>'
            + '<button type="button" class="btn-secondary cs-right">Move right ▶</button>';
        this.actions.querySelector('.cs-left').addEventListener('click', () => this.move(this.active, -1));
        this.actions.querySelector('.cs-right').addEventListener('click', () => this.move(this.active, 1));
        this.actions.querySelector('.cs-remove').addEventListener('click', () => this.remove(this.active));

        // Single-checkbox layout keeps colors 2+ in the Advanced section:
        // move them up next to Color 1 so they share its place
        let last = g1;
        for (let i = 2; document.getElementById(`colorHex${i}`); i++) {
            const g = this.group(i);
            if (!g) break;
            if (g.previousElementSibling !== last) last.insertAdjacentElement('afterend', g);
            last = g;
        }
        // Hex boxes: clean what's typed or pasted (a leading # is dropped)
        for (let i = 1; document.getElementById(`colorHex${i}`); i++) {
            const el = document.getElementById(`colorHex${i}`);
            // No length limit in the box itself: the browser would cut a paste
            // like "##FF5733" short before it could be cleaned. cleanHex()
            // keeps it to 6 digits instead.
            el.removeAttribute('maxlength');
            el.setAttribute('autocapitalize', 'characters');
            el.setAttribute('autocomplete', 'off');
            el.setAttribute('autocorrect', 'off');
            el.spellcheck = false;
            const g = this.group(i);
            const hint = g && Array.from(g.querySelectorAll('small')).find(sm => /Hold and drag/.test(sm.textContent));
            if (hint) {
                hint.classList.add('cs-hint');
                hint.dataset.csText = hint.textContent.trim();
            }
        }
        document.addEventListener('paste', (e) => {
            if (!e.target || !/^colorHex\d$/.test(e.target.id)) return;
            const code = this.extractCode(e.clipboardData && e.clipboardData.getData('text'));
            if (!code) return; // nothing that looks like a code: clean as typed
            e.preventDefault();
            this.pasteCode(e.target, code);
        }, true);
        document.addEventListener('input', (e) => {
            if (!e.target || !/^colorHex\d$/.test(e.target.id)) return;
            // Keyboards that insert clipboard text without a paste event
            // (e.g. a clipboard suggestion) send it as one multi-character input
            if (e.data && e.data.length > 1) {
                const code = this.extractCode(e.data);
                if (code) {
                    e.target.value = code;
                    try { e.target.setSelectionRange(code.length, code.length); } catch (err) { /* not focused */ }
                    return;
                }
            }
            this.cleanHex(e.target);
        }, true);
        document.addEventListener('input', (e) => {
            if (e.target && /^colorHex\d$/.test(e.target.id)) this.showErrors();
        });
        // Leaving a hex box: expand 3 digits, then flag it if it's still not valid
        document.addEventListener('focusout', (e) => {
            const m = e.target && e.target.id && e.target.id.match(/^colorHex(\d)$/);
            if (!m) return;
            this.expand(+m[1]);
            this.touched.add(+m[1]);
            this.showErrors();
        });
        // No writing, downloading or saving with a bad color
        this.guard(app, 'writeNFC', 'written');
        this.guard(app, 'downloadFile', 'downloaded');

        // Hide the old ways of turning extra colors on
        const box = document.getElementById('showAdditionalColors');
        if (box) box.closest('.form-group').classList.add('cs-extra-hint');
        document.querySelectorAll('small[data-field="colorHex2"]').forEach(el => el.classList.add('cs-extra-hint'));

        // Follow changes made elsewhere (loading a tag, format change, saved colors)
        this.wrap('populateForm', () => {
            this.active = 1;
            this.touched.clear();
            this.showErrors();
            if (!this.perColor()) this.count = this.countFromValues();
            this.render();
        });
        this.wrap('updateVisibility', () => this.render());
        this.wrap('updateColorSlots', () => { if (!this.busy) this.render(); });
        this.wrap('toggleAdditionalColors', () => {
            if (this.busy) return;
            this.count = this.countFromValues();
            this.render();
        });
        this.wrap('updateColor', () => { this.paint(); this.showErrors(); });
        new MutationObserver(() => this.followSavedColors())
            .observe(g1, { attributes: true, attributeFilter: ['class'] });

        // Placed once every script has run, so it sits just above Color 1
        // (below Saved Colors, when that's on the page)
        const place = () => {
            g1.insertAdjacentElement('beforebegin', this.root);
            if (typeof SavedColors !== 'undefined') this.guard(SavedColors, 'saveCurrent', 'saved');
            if (!this.perColor()) this.count = this.countFromValues();
            this.render();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
        else place();
    }
};

ColorSlots.init();
