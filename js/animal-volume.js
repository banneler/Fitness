/**
 * Roman-style iron volume → sperm whale / African elephant / llama breakdown.
 */
const FitnessAnimalVolume = {
    WEIGHTS: {
        whale: 77000,
        elephant: 12000,
        llama: 350
    },

    /** Match heatmap body-map glow (js/heatmap.js) */
    GLOW_PAGE: 'drop-shadow(0 0 12px rgba(59,130,246,0.45))',
    GLOW_SHARE: 'drop-shadow(0 0 10px rgba(59,130,246,0.4))',
    FILL: '#3b82f6',

    computeBreakdown(lbs) {
        const total = Math.max(0, Math.floor(parseFloat(lbs) || 0));
        const whales = Math.floor(total / this.WEIGHTS.whale);
        let rem = total % this.WEIGHTS.whale;
        const elephants = Math.floor(rem / this.WEIGHTS.elephant);
        rem = rem % this.WEIGHTS.elephant;
        const llamas = Math.floor(rem / this.WEIGHTS.llama);
        const breakdown = { whales, elephants, llamas, total };
        if (total > 0 && !this.hasAnimals(breakdown)) breakdown.llamas = 1;
        return breakdown;
    },

    hasAnimals(breakdown) {
        if (!breakdown) return false;
        return breakdown.whales > 0 || breakdown.elephants > 0 || breakdown.llamas > 0;
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
        return `<span style="display:inline-flex;align-items:center;gap:4px;line-height:0;overflow:visible;padding:3px;">${wrap(icon)}<span style="font-size:10px;font-weight:900;color:#94a3b8;letter-spacing:0.04em;">×${count}</span></span>`;
    },

    _buildGroups(breakdown, svgs, sizePx, inline) {
        const tiers = [
            { key: 'whales', svg: svgs.whale },
            { key: 'elephants', svg: svgs.elephant },
            { key: 'llamas', svg: svgs.llama }
        ];
        return tiers
            .map(t => this._glyphHtml(breakdown[t.key], t.svg, sizePx, inline))
            .filter(Boolean)
            .join('<span style="width:10px;display:inline-block;"></span>');
    },

    buildPageRowHtml(breakdown) {
        if (!this.hasAnimals(breakdown)) return '';
        const groups = [
            { key: 'whales', file: 'whale' },
            { key: 'elephants', file: 'elephant' },
            { key: 'llamas', file: 'llama' }
        ];
        const parts = groups
            .filter(t => breakdown[t.key] > 0)
            .map(t => `<span class="inline-flex items-center gap-1">${this._glyphHtml(breakdown[t.key], t.file, 28, false)}</span>`);
        return `<div class="flex flex-wrap items-center justify-center gap-3 overflow-visible py-1">${parts.join('')}</div>`;
    },

    async buildShareRowHtml(lbs) {
        const breakdown = this.computeBreakdown(lbs);
        if (!this.hasAnimals(breakdown)) return '';
        const [whale, elephant, llama] = await Promise.all([
            this.loadSvg('whale'),
            this.loadSvg('elephant'),
            this.loadSvg('llama')
        ]);
        const glyphs = this._buildGroups(breakdown, { whale, elephant, llama }, 22, true);
        return `<div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;margin-bottom:18px;padding:12px 14px;background:rgba(15,23,42,0.55);border-radius:14px;border:1px solid rgba(255,255,255,0.06);">
            <div style="width:100%;font-size:7px;font-weight:900;color:#64748b;letter-spacing:0.22em;text-align:center;margin-bottom:8px;">ANIMAL NUMBER</div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;line-height:0;overflow:visible;padding:4px 0;">${glyphs}</div>
        </div>`;
    }
};
