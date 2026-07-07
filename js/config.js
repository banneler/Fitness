/** Bryan Anneler — owns the global standard exercise library. */
window.FITNESS_STANDARD_LIBRARY_OWNER_ID = '6f471a6f-3697-4826-a0d8-34404ea5980d';

/** Bridge freshly saved workout logs into pages that fetch history immediately after redirect. */
window.FitnessWorkoutSync = {
    PENDING_KEY: 'constellation_pending_logs',

    stashPending(logs) {
        if (logs?.length) sessionStorage.setItem(this.PENDING_KEY, JSON.stringify(logs));
    },

    mergeFetched(fetched) {
        const raw = sessionStorage.getItem(this.PENDING_KEY);
        if (!raw) return fetched || [];
        sessionStorage.removeItem(this.PENDING_KEY);
        try {
            const pending = JSON.parse(raw);
            const list = [...(fetched || [])];
            const keys = new Set(list.map(log => `${log.exercise_name}|${log.created_at}`));
            pending.forEach(log => {
                const key = `${log.exercise_name}|${log.created_at}`;
                if (!keys.has(key)) {
                    list.unshift(log);
                    keys.add(key);
                }
            });
            return list;
        } catch (e) {
            console.warn('Pending workout merge failed', e);
            return fetched || [];
        }
    }
};
