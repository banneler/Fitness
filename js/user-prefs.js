/**
 * Per-device layout preferences (localStorage).
 */
window.FitnessUserPrefs = {
    STORAGE_KEY: 'constellation_user_prefs',

    defaults() {
        return {
            pages: { gym: true, kitchen: true, arena: true, tracker: true },
            today: {
                resumeSession: true,
                lowStock: true,
                arenaCheers: true,
                fuelTarget: true,
                ironVolume: true,
                hydration: true,
                readiness: true
            }
        };
    },

    load() {
        const base = this.defaults();
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return base;
            const saved = JSON.parse(raw);
            return {
                pages: { ...base.pages, ...(saved.pages || {}) },
                today: { ...base.today, ...(saved.today || {}) }
            };
        } catch (e) {
            console.warn('FitnessUserPrefs.load failed', e);
            return base;
        }
    },

    save(prefs) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(prefs));
    },

    isPageEnabled(prefs, pageId) {
        if (pageId === 'today') return true;
        return prefs?.pages?.[pageId] !== false;
    },

    guardPage(pageId) {
        const prefs = this.load();
        if (!this.isPageEnabled(prefs, pageId)) {
            window.location.replace('today.html');
            return false;
        }
        return true;
    }
};
