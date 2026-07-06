/**
 * Weekly community PR board — detect, record, and display personal records.
 */
const FitnessArenaPrs = {
    weekStartDate(d = new Date()) {
        const x = new Date(d);
        const diff = (x.getDay() + 6) % 7;
        x.setDate(x.getDate() - diff);
        x.setHours(0, 0, 0, 0);
        return x.toLocaleDateString('en-CA');
    },

    weekStartMs(d = new Date()) {
        const ds = this.weekStartDate(d);
        return new Date(ds + 'T00:00:00').getTime();
    },

    exerciseKey(log) {
        if (log?.exercise_id) return `id:${log.exercise_id}`;
        return `name:${(log.exercise_name || '').trim().toLowerCase()}`;
    },

    maxWeightFromSets(sets) {
        let max = 0;
        let repsAtMax = 0;
        (sets || []).forEach(s => {
            const w = parseFloat(s?.weight) || 0;
            const r = parseInt(s?.reps, 10) || 0;
            if (w > max) {
                max = w;
                repsAtMax = r;
            }
        });
        return max > 0 ? { weight: max, reps: repsAtMax } : null;
    },

    priorMaxBefore(history, log, excludeCreatedAt = null) {
        const key = this.exerciseKey(log);
        const cutoff = excludeCreatedAt || log.created_at;
        let prior = 0;
        (history || []).forEach(h => {
            if (this.exerciseKey(h) !== key) return;
            if (new Date(h.created_at).getTime() >= new Date(cutoff).getTime()) return;
            const peak = this.maxWeightFromSets(h.sets_data);
            if (peak && peak.weight > prior) prior = peak.weight;
        });
        return prior;
    },

    async recordSessionPrs(client, userId, newLogs, historyLogs = null) {
        if (!newLogs?.length) return [];
        let history = historyLogs;
        if (!history) {
            const { data } = await client
                .from('workout_logs')
                .select('exercise_id, exercise_name, sets_data, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: true });
            history = data || [];
        }

        const weekStart = this.weekStartDate();
        const inserted = [];

        for (const log of newLogs) {
            const peak = this.maxWeightFromSets(log.sets_data);
            if (!peak) continue;

            const previous = this.priorMaxBefore(history, log, log.created_at);
            if (peak.weight <= previous) continue;

            const row = {
                user_id: userId,
                exercise_id: log.exercise_id || null,
                exercise_name: log.exercise_name || 'Lift',
                weight: peak.weight,
                reps: peak.reps || null,
                previous_weight: previous > 0 ? previous : null,
                achieved_at: log.created_at || new Date().toISOString(),
                week_start: weekStart
            };

            const { data, error } = await client
                .from('arena_pr_events')
                .insert([row])
                .select('*')
                .maybeSingle();

            if (!error && data) inserted.push(data);
        }

        return inserted;
    },

    computeWeeklyPrsFromLogs(logs, profiles = {}) {
        const weekStart = this.weekStartMs();
        const now = Date.now();
        const weekEnd = weekStart + 7 * 86400000;
        const events = [];
        const priorMax = {};

        const sorted = [...(logs || [])].sort(
            (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );

        sorted.forEach(log => {
            const t = new Date(log.created_at).getTime();
            const key = this.exerciseKey(log);
            const peak = this.maxWeightFromSets(log.sets_data);
            if (!peak) return;

            const before = priorMax[key] || 0;
            if (peak.weight > before && t >= weekStart && t < weekEnd) {
                events.push({
                    id: `${log.user_id}-${key}-${peak.weight}-${t}`,
                    user_id: log.user_id,
                    exercise_id: log.exercise_id,
                    exercise_name: log.exercise_name,
                    weight: peak.weight,
                    reps: peak.reps,
                    previous_weight: before > 0 ? before : null,
                    achieved_at: log.created_at,
                    week_start: this.weekStartDate(new Date(t)),
                    profile: profiles[log.user_id] || null,
                    _computed: true
                });
            }
            priorMax[key] = Math.max(priorMax[key] || 0, peak.weight);
        });

        return events.sort((a, b) => new Date(b.achieved_at) - new Date(a.achieved_at));
    },

    async fetchWeeklyFeed(client, profiles = {}) {
        const weekStart = this.weekStartDate();
        const { data, error } = await client
            .from('arena_pr_events')
            .select('*')
            .eq('week_start', weekStart)
            .order('achieved_at', { ascending: false });

        if (!error && data?.length) {
            return data.map(row => ({
                ...row,
                profile: profiles[row.user_id] || null,
                _computed: false
            }));
        }

        if (error?.code === '42P01') {
            return { tableMissing: true, events: [] };
        }

        const since = new Date(this.weekStartMs()).toISOString();
        const { data: logs } = await client
            .from('workout_logs')
            .select('user_id, exercise_id, exercise_name, sets_data, created_at')
            .gte('created_at', since)
            .order('created_at', { ascending: true });

        return {
            tableMissing: false,
            events: this.computeWeeklyPrsFromLogs(logs || [], profiles),
            computedFallback: true
        };
    },

    formatPrDelta(current, previous) {
        const c = parseFloat(current) || 0;
        const p = parseFloat(previous) || 0;
        if (!p || c <= p) return null;
        const delta = c - p;
        return `+${delta % 1 === 0 ? delta : delta.toFixed(1)}`;
    },

    fireConfettiCanon() {
        if (typeof confetti !== 'function') return;
        const count = 200;
        const defaults = { origin: { y: 0.6 }, zIndex: 9999 };
        confetti({ ...defaults, particleCount: count * 0.25, spread: 26, startVelocity: 55 });
        confetti({ ...defaults, particleCount: count * 0.2, spread: 60 });
        confetti({ ...defaults, particleCount: count * 0.35, spread: 100, decay: 0.91, scalar: 0.8 });
        confetti({ ...defaults, particleCount: count * 0.1, spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
        confetti({ ...defaults, particleCount: count * 0.1, spread: 120, startVelocity: 45 });
    }
};
