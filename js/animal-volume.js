/**
 * Roman-style iron volume → megafauna (mammoth/T-Rex) / elephant / moose / llama breakdown.
 */
const FitnessAnimalVolume = {
    LABEL: 'Animal Equivalent',

    /** Top tier alternates mammoth ↔ T-Rex (same 20k weight). */
    TOP_TIER: { key: 'megafauna', weight: 20000, files: ['mammoth', 'trex'] },

    TIERS: [
        { key: 'elephants', file: 'elephant', weight: 12000 },
        { key: 'moose', file: 'moose', weight: 1600 },
        { key: 'llamas', file: 'llama', weight: 350 }
    ],

    /** Match heatmap body-map glow (js/heatmap.js) */
    GLOW_PAGE: 'drop-shadow(0 0 16px rgba(59,130,246,0.5))',
    GLOW_SHARE: 'drop-shadow(0 0 14px rgba(59,130,246,0.45))',
    FILL: '#3b82f6',
    SIZE_PAGE: 60,
    SIZE_SHARE: 52,

    computeBreakdown(lbs) {
        const total = Math.max(0, Math.floor(parseFloat(lbs) || 0));
        const breakdown = { total, megafauna: 0 };
        let rem = total;

        breakdown.megafauna = Math.floor(rem / this.TOP_TIER.weight);
        rem %= this.TOP_TIER.weight;

        this.TIERS.forEach(tier => {
            breakdown[tier.key] = Math.floor(rem / tier.weight);
            rem %= tier.weight;
        });

        if (total > 0 && !this.hasAnimals(breakdown)) {
            breakdown.llamas = 1;
        }
        return breakdown;
    },

    hasAnimals(breakdown) {
        if (!breakdown) return false;
        if (breakdown.megafauna > 0) return true;
        return this.TIERS.some(tier => breakdown[tier.key] > 0);
    },

    /** Stable odd/even pick from a date, session id, timestamp, etc. */
    _seedHash(seed) {
        const s = seed != null ? String(seed) : new Date().toLocaleDateString('en-CA');
        let h = 0;
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
    },

    topTierFile(seed) {
        const files = this.TOP_TIER.files;
        return files[this._seedHash(seed) % files.length];
    },

    _activeTierCount(breakdown) {
        let n = breakdown.megafauna > 0 ? 1 : 0;
        n += this.TIERS.filter(tier => breakdown[tier.key] > 0).length;
        return n;
    },

    _svgCache: {},

    async loadSvg(name) {
        if (this._svgCache[name]) return this._svgCache[name];
        const res = await fetch(`${name}.svg`);
        if (!res.ok) throw new Error(`Missing ${name}.svg`);
        this._svgCache[name] = await res.text();
        return this._svgCache[name];
    },

    inlineSvg(raw, sizePx, glow) {
        const filter = glow || this.GLOW_SHARE;
        const sizeStyle = `width:${sizePx}px;height:${sizePx}px;display:block;flex-shrink:0;overflow:visible;filter:${filter};`;
        return raw
            .replace(/<\?xml[^?]*\?>\s*/i, '')
            .replace(/<!--[\s\S]*?-->\s*/g, '')
            .replace(/<svg([^>]*)>/, (match, attrs) => {
                const cleaned = attrs.replace(/\sstyle="[^"]*"/gi, '');
                return `<svg${cleaned} style="${sizeStyle}">`;
            })
            .replace(/\s(width|height)="[^"]*"/gi, '')
            .replace('</svg>', `<style>path{fill:${this.FILL}!important}</style></svg>`);
    },

    _glyphHtml(count, svgMarkup, sizePx, inline) {
        if (count <= 0) return '';
        const glow = inline ? this.GLOW_SHARE : this.GLOW_PAGE;
        const icon = inline
            ? this.inlineSvg(svgMarkup, sizePx, glow)
            : `<img src="/${svgMarkup}.svg" alt="" style="width:${sizePx}px;height:${sizePx}px;display:block;flex-shrink:0;opacity:0.95;filter:brightness(0) saturate(100%) invert(42%) sepia(93%) saturate(1352%) hue-rotate(196deg) brightness(97%) contrast(101%) ${glow};">`;
        const wrap = (html) => `<span style="display:inline-flex;line-height:0;overflow:visible;padding:1px;">${html}</span>`;
        if (count === 1) return wrap(icon);
        const multSize = Math.max(11, Math.round(sizePx * 0.22));
        return `<span style="display:inline-flex;align-items:center;gap:2px;line-height:0;overflow:visible;padding:1px;flex-shrink:0;">${wrap(icon)}<span style="font-size:${multSize}px;font-weight:900;color:#94a3b8;letter-spacing:0.04em;">×${count}</span></span>`;
    },

    _rowIconSize(breakdown, baseSize) {
        const tiers = this._activeTierCount(breakdown);
        if (tiers >= 4) return Math.round(baseSize * 0.88);
        if (tiers >= 3) return Math.round(baseSize * 0.94);
        return baseSize;
    },

    _megafaunaGlyph(breakdown, svgs, sizePx, inline, seed) {
        const count = breakdown.megafauna;
        if (count <= 0) return '';
        const file = this.topTierFile(seed);
        const markup = inline ? svgs[file] : file;
        return this._glyphHtml(count, markup, sizePx, inline);
    },

    _buildRowPartsHtml(breakdown, sizePx, seed, inline, svgs) {
        const parts = [];
        const mega = this._megafaunaGlyph(breakdown, svgs || {}, sizePx, inline, seed);
        if (mega) {
            parts.push(`<span style="display:inline-flex;align-items:center;gap:2px;flex-shrink:0;line-height:0;">${mega}</span>`);
        }
        this.TIERS.filter(tier => breakdown[tier.key] > 0).forEach(tier => {
            const markup = inline ? svgs[tier.file] : tier.file;
            parts.push(`<span style="display:inline-flex;align-items:center;gap:2px;flex-shrink:0;line-height:0;">${this._glyphHtml(breakdown[tier.key], markup, sizePx, inline)}</span>`);
        });
        return parts.join('<span style="width:6px;display:inline-block;flex-shrink:0;"></span>');
    },

    _rowHtml(glyphs, inline) {
        if (inline) {
            return `<div style="display:flex;flex-wrap:nowrap;align-items:center;justify-content:center;gap:4px;line-height:0;overflow:visible;padding:6px 0;max-width:100%;">${glyphs}</div>`;
        }
        return `<div class="flex flex-nowrap items-center justify-center gap-2 overflow-visible py-2 max-w-full">${glyphs}</div>`;
    },

    _shareRowInnerHtml(breakdown, seed) {
        const size = this._rowIconSize(breakdown, this.SIZE_SHARE);
        return this._rowHtml(this._buildRowPartsHtml(breakdown, size, seed, false, {}), true);
    },

    buildPageRowHtml(breakdown, seed) {
        if (!this.hasAnimals(breakdown)) return '';
        const size = this._rowIconSize(breakdown, this.SIZE_PAGE);
        return this._rowHtml(this._buildRowPartsHtml(breakdown, size, seed, false, {}), false);
    },

    buildShareRowHtml(lbs, seed) {
        const breakdown = this.computeBreakdown(lbs);
        if (!this.hasAnimals(breakdown)) return '';
        return `<div style="margin-bottom:18px;padding:12px 14px;background:rgba(15,23,42,0.55);border-radius:14px;border:1px solid rgba(255,255,255,0.06);">
            <div style="width:100%;font-size:7px;font-weight:900;color:#64748b;letter-spacing:0.22em;text-align:center;margin-bottom:8px;">${this.LABEL.toUpperCase()}</div>
            ${this._shareRowInnerHtml(breakdown, seed)}
        </div>`;
    },

    /** Inline SVG row for html2canvas once images are embedded. */
    async buildShareRowHtmlForCapture(lbs, seed) {
        const breakdown = this.computeBreakdown(lbs);
        if (!this.hasAnimals(breakdown)) return '';
        const files = [...this.TOP_TIER.files, ...this.TIERS.map(t => t.file)];
        const svgEntries = await Promise.all(files.map(file => this.loadSvg(file)));
        const svgs = {};
        files.forEach((file, i) => { svgs[file] = svgEntries[i]; });
        const size = this._rowIconSize(breakdown, this.SIZE_SHARE);
        const glyphs = this._buildRowPartsHtml(breakdown, size, seed, true, svgs);
        return `<div style="margin-bottom:18px;padding:12px 14px;background:rgba(15,23,42,0.55);border-radius:14px;border:1px solid rgba(255,255,255,0.06);">
            <div style="width:100%;font-size:7px;font-weight:900;color:#64748b;letter-spacing:0.22em;text-align:center;margin-bottom:8px;">${this.LABEL.toUpperCase()}</div>
            ${this._rowHtml(glyphs, true)}
        </div>`;
    }
};
