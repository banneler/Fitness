/**
 * Muscle heatmap computation + compact grid for share cards.
 */
const FitnessHeatmap = {
    MUSCLES: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'quads', 'hamstrings', 'glutes', 'calves', 'hips'],

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
            const exDef = (libraryExercises || []).find(e => e.name === log.exercise_name);
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
        return ({ recov: 'RECOVERING', tired: 'FATIGUED', prime: 'PRIME', fresh: 'COLD' })[status] || 'COLD';
    },

    buildGridHtml(statuses) {
        return this.MUSCLES.map(m => {
            const s = statuses[m]?.status || 'fresh';
            const color = this.statusColor(s);
            const label = this.statusLabel(s);
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:9px;font-weight:800;color:#64748b;letter-spacing:0.12em;text-transform:uppercase;">${m}</span>
                <span style="font-size:9px;font-weight:900;color:${color};letter-spacing:0.08em;">● ${label}</span>
            </div>`;
        }).join('');
    },

    countByStatus(statuses) {
        const counts = { recov: 0, tired: 0, prime: 0, fresh: 0 };
        this.MUSCLES.forEach(m => {
            const s = statuses[m]?.status || 'fresh';
            counts[s] = (counts[s] || 0) + 1;
        });
        return counts;
    }
};
