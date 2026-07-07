/**
 * Roman-style iron volume → mammoth / T-Rex / elephant / moose / llama breakdown.
 */
const FitnessAnimalVolume = {
    TIERS: [
        { key: 'mammoths', file: 'mammoth', weight: 20000 },
        { key: 'trexes', file: 'trex', weight: 18000 },
        { key: 'elephants', file: 'elephant', weight: 12000 },
        { key: 'moose', file: 'moose', weight: 1600 },
        { key: 'llamas', file: 'llama', weight: 350 }
    ],

    /** Match heatmap body-map glow (js/heatmap.js) */
    GLOW_PAGE: 'drop-shadow(0 0 16px rgba(59,130,246,0.5))',
    GLOW_SHARE: 'drop-shadow(0 0 14px rgba(59,130,246,0.45))',
    FILL: '#3b82f6',
    SIZE_PAGE: 40,
    SIZE_SHARE: 34,

    computeBreakdown(lbs) {
        const total = Math.max(0, Math.floor(parseFloat(lbs) || 0));
        const breakdown = { total };
        let rem = total;

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
        return this.TIERS.some(tier => breakdown[tier.key] > 0);
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
        return raw
            .replace(/<\?xml[^?]*\?>\s*/i, '')
            .replace(
                /<svg([^>]*)>/,
                `<svg$1 style="width:${sizePx}px;height:${sizePx}px;display:block;flex-shrink:0;overflow:visible;filter:${filter};">`
            )
            .replace(/\s(width|height)="[^"]*"/gi, '')
            .replace('</svg>', `<style>path{fill:${this.FILL}!important}</style></svg>`);
    },

    _glyphHtml(count, svgMarkup, sizePx, inline) {
        if (count <= 0) return '';
        const glow = inline ? this.GLOW_SHARE : this.GLOW_PAGE;
        const icon = inline
            ? this.inlineSvg(svgMarkup, sizePx, glow)
            : `<img src="${svgMarkup}.svg" alt="" style="width:${sizePx}px;height:${sizePx}px;display:block;flex-shrink:0;opacity:0.95;filter:brightness(0) saturate(100%) invert(42%) sepia(93%) saturate(1352%) hue-rotate(196deg) brightness(97%) contrast(101%) ${glow};">`;
        const wrap = (html) => `<span style="display:inline-flex;line-height:0;overflow:visible;padding:3px;">${html}</span>`;
        if (count <= 4) {
            return Array(count).fill(wrap(icon)).join('');
        }
        return `<span style="display:inline-flex;align-items:center;gap:4px;line-height:0;overflow:visible;padding:3px;">${wrap(icon)}<span style="font-size:11px;font-weight:900;color:#94a3b8;letter-spacing:0.04em;">×${count}</span></span>`;
    },

    _buildGroups(breakdown, svgs, sizePx, inline) {
        return this.TIERS
            .map(tier => this._glyphHtml(breakdown[tier.key], svgs[tier.file], sizePx, inline))
            .filter(Boolean)
            .join('<span style="width:10px;display:inline-block;"></span>');
    },

    buildPageRowHtml(breakdown) {
        if (!this.hasAnimals(breakdown)) return '';
        const parts = this.TIERS
            .filter(tier => breakdown[tier.key] > 0)
            .map(tier => `<span class="inline-flex items-center gap-1">${this._glyphHtml(breakdown[tier.key], tier.file, this.SIZE_PAGE, false)}</span>`);
        return `<div class="flex flex-wrap items-center justify-center gap-4 overflow-visible py-2">${parts.join('')}</div>`;
    },

    async buildShareRowHtml(lbs) {
        const breakdown = this.computeBreakdown(lbs);
        if (!this.hasAnimals(breakdown)) return '';
        const svgEntries = await Promise.all(this.TIERS.map(tier => this.loadSvg(tier.file)));
        const svgs = {};
        this.TIERS.forEach((tier, i) => { svgs[tier.file] = svgEntries[i]; });
        const glyphs = this._buildGroups(breakdown, svgs, this.SIZE_SHARE, true);
        return `<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;margin-bottom:18px;padding:14px 16px;background:rgba(15,23,42,0.55);border-radius:14px;border:1px solid rgba(255,255,255,0.06);">
            <div style="width:100%;font-size:7px;font-weight:900;color:#64748b;letter-spacing:0.22em;text-align:center;margin-bottom:10px;">ANIMAL NUMBER</div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;line-height:0;overflow:visible;padding:6px 0;">${glyphs}</div>
        </div>`;
    }
};
