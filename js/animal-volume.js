/**
 * Roman-style iron volume → sperm whale / African elephant / llama breakdown.
 */
const FitnessAnimalVolume = {
    WEIGHTS: {
        whale: 90000,
        elephant: 12000,
        llama: 350
    },

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

    inlineSvg(raw, sizePx) {
        return raw
            .replace(/<\?xml[^?]*\?>\s*/i, '')
            .replace(/<svg([^>]*)>/, `<svg$1 style="width:${sizePx}px;height:${sizePx}px;display:block;flex-shrink:0;">`)
            .replace(/\s(width|height)="[^"]*"/gi, '')
            .replace('</svg>', '<style>path{fill:#94a3b8!important}</style></svg>');
    },

    _glyphHtml(count, svgMarkup, sizePx, inline) {
        if (count <= 0) return '';
        const icon = inline
            ? this.inlineSvg(svgMarkup, sizePx)
            : `<img src="${svgMarkup}.svg" alt="" style="width:${sizePx}px;height:${sizePx}px;display:block;flex-shrink:0;opacity:0.9;filter:brightness(0) invert(0.78);">`;
        if (count <= 4) {
            return Array(count).fill(`<span style="display:inline-flex;line-height:0;">${icon}</span>`).join('');
        }
        return `<span style="display:inline-flex;align-items:center;gap:4px;line-height:0;">${icon}<span style="font-size:10px;font-weight:900;color:#94a3b8;letter-spacing:0.04em;">×${count}</span></span>`;
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
        return `<div class="flex flex-wrap items-center justify-center gap-3">${parts.join('')}</div>`;
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
            <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;line-height:0;">${glyphs}</div>
        </div>`;
    }
};
