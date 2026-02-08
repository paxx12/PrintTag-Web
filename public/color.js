// Color picker utilities (canvas-based HSV gradient pickers)

const ColorPicker = {
    state: {},
    _resizeHandlers: [],

    // --- Color conversion ---

    hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    },

    rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;
        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h, s, v];
    },

    hexToHsv(hex) {
        const val = hex.replace('#', '').trim();
        if (!/^[0-9a-fA-F]{6}$/.test(val)) return null;
        return this.rgbToHsv(
            parseInt(val.slice(0, 2), 16),
            parseInt(val.slice(2, 4), 16),
            parseInt(val.slice(4, 6), 16)
        );
    },

    hsvToHex(h, s, v) {
        return this.hsvToRgb(h, s, v)
            .map(c => c.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
    },

    // --- Canvas drawing ---

    drawHueArea(ctx, w, h) {
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        for (let i = 0; i <= 6; i++) {
            const stop = i / 6;
            const [r, g, b] = this.hsvToRgb(stop, 1, 1);
            grad.addColorStop(stop, `rgb(${r},${g},${b})`);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    },

    drawSVSquare(ctx, w, h, hue) {
        const [r, g, b] = this.hsvToRgb(hue, 1, 1);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, 0, w, h);
        const white = ctx.createLinearGradient(0, 0, w, 0);
        white.addColorStop(0, 'rgba(255,255,255,1)');
        white.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = white;
        ctx.fillRect(0, 0, w, h);
        const black = ctx.createLinearGradient(0, 0, 0, h);
        black.addColorStop(0, 'rgba(0,0,0,0)');
        black.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = black;
        ctx.fillRect(0, 0, w, h);
    },

    drawSVMarker(ctx, w, h, s, v) {
        const x = Math.max(0, Math.min(w, Math.round(s * w)));
        const y = Math.max(0, Math.min(h, Math.round((1 - v) * h)));
        const r = Math.max(4, Math.floor(Math.min(w, h) * 0.02));
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, r - 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.stroke();
        ctx.restore();
    },

    drawHueMarker(ctx, w, h, hue) {
        const x = Math.max(0, Math.min(w, Math.round(hue * w)));
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 3, 0);
        ctx.lineTo(x + 3, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.stroke();
        ctx.restore();
    },

    // --- Canvas setup ---

    setupCanvas(canvas, drawFn) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const resize = () => {
            const cssW = canvas.clientWidth || canvas.width;
            const cssH = canvas.clientHeight || canvas.height;
            canvas.width = Math.floor(cssW * dpr);
            canvas.height = Math.floor(cssH * dpr);
            drawFn(ctx, canvas.width, canvas.height);
        };
        resize();
        window.addEventListener('resize', resize);
        this._resizeHandlers.push(resize);
        return ctx;
    },

    // --- Touch drag helper (long-press to activate, manual scroll pass-through) ---
    // Uses touch-action:none to fully disable compositor scrolling on picker
    // canvases, then manually scrolls the page when the user swipes.

    addTouchDrag(element, pickFn) {
        element.style.touchAction = 'none';

        // State machine: idle -> pending -> picking | scrolling
        let startX, startY, lastX, lastY, timer;
        let phase = 'idle';

        const end = () => {
            clearTimeout(timer);
            phase = 'idle';
        };

        element.addEventListener('touchstart', (e) => {
            end();
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            startX = lastX = t.clientX;
            startY = lastY = t.clientY;
            phase = 'pending';
            timer = setTimeout(() => {
                if (phase !== 'pending') return;
                phase = 'picking';
                if (navigator.vibrate) try { navigator.vibrate(15); } catch {}
                pickFn(t);
            }, 300);
        });

        element.addEventListener('touchmove', (e) => {
            const t = e.touches[0];

            if (phase === 'pending') {
                if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) {
                    clearTimeout(timer);
                    phase = 'scrolling';
                    // fall through to scrolling below
                } else {
                    return; // waiting, no scroll yet, touch-action:none handles it
                }
            }

            if (phase === 'scrolling') {
                window.scrollBy(lastX - t.clientX, lastY - t.clientY);
                lastX = t.clientX;
                lastY = t.clientY;
                return;
            }

            if (phase === 'picking') {
                pickFn(t);
            }
        });

        element.addEventListener('touchend', end);
        element.addEventListener('touchcancel', end);
    },

    // --- Redraw a single picker from its state ---

    redraw(i) {
        const st = this.state[i];
        if (!st) return;

        const sv = document.getElementById(`colorSV${i}`);
        const hueBar = document.getElementById(`colorHue${i}`);
        if (!sv || !hueBar) return;

        const svCtx = sv.getContext('2d');
        const hueCtx = hueBar.getContext('2d');

        this.drawSVSquare(svCtx, sv.width, sv.height, st.hue);
        this.drawSVMarker(svCtx, sv.width, sv.height, st.s, st.v);
        this.drawHueArea(hueCtx, hueBar.width, hueBar.height);
        this.drawHueMarker(hueCtx, hueBar.width, hueBar.height, st.hue);
    },

    // --- External API ---

    setFromHex(index, hex) {
        const i = parseInt(index, 10);
        if (!i) return;
        const hsv = this.hexToHsv(hex);
        if (!hsv) return;

        this.state[i] = this.state[i] || {};
        [this.state[i].hue, this.state[i].s, this.state[i].v] = hsv;
        this.redraw(i);
    },

    // --- Main initialization ---

    init(app, count = 4) {
        for (let i = 1; i <= count; i++) {
            const inputEl = document.getElementById(`colorHex${i}`);
            const initialHex = (inputEl && inputEl.value) || 'FFFFFF';
            const hsv = this.hexToHsv(initialHex) || [0, 0, 1];
            this.state[i] = { hue: hsv[0], s: hsv[1], v: hsv[2] };

            const sv = document.getElementById(`colorSV${i}`);
            const hueBar = document.getElementById(`colorHue${i}`);
            if (!sv || !hueBar) continue;

            this.setupCanvas(sv, (ctx, w, h) => {
                this.drawSVSquare(ctx, w, h, this.state[i].hue);
                this.drawSVMarker(ctx, w, h, this.state[i].s, this.state[i].v);
            });
            this.setupCanvas(hueBar, (ctx, w, h) => {
                this.drawHueArea(ctx, w, h);
                this.drawHueMarker(ctx, w, h, this.state[i].hue);
            });

            const applyColor = () => {
                const hex = this.hsvToHex(this.state[i].hue, this.state[i].s, this.state[i].v);
                if (inputEl) inputEl.value = hex;
                if (app && typeof app.updateColor === 'function') app.updateColor('#' + hex, i);
                if (app && typeof app.updateRecordSize === 'function') app.updateRecordSize();
            };

            // --- SV square interaction ---
            const pickSV = (evt) => {
                const rect = sv.getBoundingClientRect();
                this.state[i].s = Math.max(0, Math.min(1, (evt.clientX - rect.left) / rect.width));
                this.state[i].v = 1 - Math.max(0, Math.min(1, (evt.clientY - rect.top) / rect.height));
                applyColor();
                this.redraw(i);
            };

            let dragSV = false;
            sv.addEventListener('mousedown', (e) => { dragSV = true; pickSV(e); });
            sv.addEventListener('mousemove', (e) => { if (dragSV) { pickSV(e); e.preventDefault(); } }, { passive: false });
            window.addEventListener('mouseup', () => { dragSV = false; });
            this.addTouchDrag(sv, pickSV);

            // --- Hue bar interaction ---
            const pickHue = (evt) => {
                const rect = hueBar.getBoundingClientRect();
                this.state[i].hue = Math.max(0, Math.min(1, (evt.clientX - rect.left) / rect.width));
                applyColor();
                this.redraw(i);
            };

            let dragHue = false;
            hueBar.addEventListener('mousedown', (e) => { dragHue = true; pickHue(e); });
            hueBar.addEventListener('mousemove', (e) => { if (dragHue) { pickHue(e); e.preventDefault(); } }, { passive: false });
            window.addEventListener('mouseup', () => { dragHue = false; });
            this.addTouchDrag(hueBar, pickHue);

            // --- Hex input sync ---
            if (inputEl) {
                inputEl.addEventListener('input', () => {
                    const hsv = this.hexToHsv(inputEl.value);
                    if (!hsv) return;
                    [this.state[i].hue, this.state[i].s, this.state[i].v] = hsv;
                    this.redraw(i);
                });
            }

            this.redraw(i);
        }
    }
};
