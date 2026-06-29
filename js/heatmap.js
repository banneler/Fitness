/**
 * Muscle heatmap computation + body map SVG for share cards.
 */
const FitnessHeatmap = {
    MUSCLES: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'quads', 'hamstrings', 'glutes', 'calves', 'hips'],
    BODY_GROUPS: ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Hips'],
    /** Share card viewBox — shifted up vs gym so the crown isn't clipped at y=130 */
    SHARE_VIEWBOX: '0 95 612 635',
    _bodyMapSvg: null,

    defaultStatuses() {
        const map = {};
        this.MUSCLES.forEach(m => { map[m] = { status: 'fresh', lastTrained: null }; });
        return map;
    },

    compute(rawLogs, libraryExercises) {
        const statuses = this.defaultStatuses();
        const now = Date.now();
        const oneDay = 86400000;

        (rawLogs || []).forEach(log => {
            const exDef = typeof FitnessExerciseLibrary !== 'undefined'
                ? FitnessExerciseLibrary.findForLog(libraryExercises, log)
                : (libraryExercises || []).find(e => e.name === log.exercise_name);
            if (!exDef?.muscle_group) return;
            const key = exDef.muscle_group.toLowerCase();
            if (!statuses[key]) return;
            const logTime = new Date(log.created_at).getTime();
            if (!statuses[key].lastTrained || logTime > statuses[key].lastTrained) {
                statuses[key].lastTrained = logTime;
            }
        });

        Object.keys(statuses).forEach(m => {
            if (!statuses[m].lastTrained) return;
            const daysSince = (now - statuses[m].lastTrained) / oneDay;
            if (daysSince < 1.5) statuses[m].status = 'recov';
            else if (daysSince < 3.5) statuses[m].status = 'tired';
            else if (daysSince < 6) statuses[m].status = 'prime';
            else statuses[m].status = 'fresh';
        });

        return statuses;
    },

    statusColor(status) {
        return ({ recov: '#ef4444', tired: '#a855f7', prime: '#2dd4bf', fresh: '#3b82f6' })[status] || '#3b82f6';
    },

    statusLabel(status) {
        return ({ recov: 'RECOVERING', tired: 'FATIGUED', prime: 'PRIME', cold: 'COLD', fresh: 'COLD' })[status] || 'COLD';
    },

    async loadBodyMapSvg() {
        if (this._bodyMapSvg) return this._bodyMapSvg;
        const res = await fetch('body-map.svg');
        this._bodyMapSvg = await res.text();
        return this._bodyMapSvg;
    },

    buildStatusStyles(statuses) {
        let css = '#Base path{fill:#1e293b;stroke:rgba(255,255,255,0.12);stroke-width:1px}';
        this.BODY_GROUPS.forEach(id => {
            const s = statuses?.[id.toLowerCase()]?.status || 'fresh';
            const color = this.statusColor(s);
            const opacity = s === 'prime' ? '1' : '0.88';
            css += `#${id} path{fill:${color}!important;opacity:${opacity}}`;
        });
        return css;
    },

    async buildBodySvgHtml(statuses) {
        const raw = await this.loadBodyMapSvg();
        const style = this.buildStatusStyles(statuses || this.defaultStatuses());
        const vb = this.SHARE_VIEWBOX;
        return raw
            .replace(
                'viewBox="0 130 612 590"',
                `viewBox="${vb}" preserveAspectRatio="xMidYMid meet" style="width:100%;max-width:300px;height:auto;display:block;margin:0 auto;overflow:visible;filter:drop-shadow(0 0 16px rgba(59,130,246,0.35))"`
            )
            .replace('</svg>', `<style>${style}</style></svg>`);
    },

    legendHtml(statuses) {
        const counts = { recov: 0, tired: 0, prime: 0, fresh: 0 };
        this.MUSCLES.forEach(m => {
            const s = statuses?.[m]?.status || 'fresh';
            counts[s] = (counts[s] || 0) + 1;
        });
        return [
            { c: '#ef4444', l: 'RECOVERING' },
            { c: '#a855f7', l: 'FATIGUED' },
            { c: '#2dd4bf', l: 'PRIME' },
            { c: '#3b82f6', l: 'COLD' }
        ].map(x => `<span style="font-size:7px;font-weight:800;color:${x.c};margin-right:10px;letter-spacing:0.06em;">● ${x.l}</span>`).join('');
    }
};
