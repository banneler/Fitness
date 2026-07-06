/**
 * App layout preferences — localStorage first, Supabase profiles.layout_prefs as backup.
 *
 * Load: use localStorage when present; otherwise restore from DB into localStorage.
 * Save: write to both localStorage and profiles.layout_prefs.
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

    merge(saved) {
        const base = this.defaults();
        return {
            pages: { ...base.pages, ...(saved?.pages || {}) },
            today: { ...base.today, ...(saved?.today || {}) }
        };
    },

    hasLocal() {
        try {
            return !!localStorage.getItem(this.STORAGE_KEY);
        } catch (e) {
            return false;
        }
    },

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return this.defaults();
            return this.merge(JSON.parse(raw));
        } catch (e) {
            console.warn('FitnessUserPrefs.load failed', e);
            return this.defaults();
        }
    },

    save(prefs) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(prefs));
    },

    async hydrate(client, userId) {
        if (this.hasLocal()) return this.load();
        if (!client || !userId) return this.load();

        try {
            const { data, error } = await client
                .from('profiles')
                .select('layout_prefs')
                .eq('id', userId)
                .single();
            if (error) throw error;
            if (data?.layout_prefs && typeof data.layout_prefs === 'object') {
                const prefs = this.merge(data.layout_prefs);
                this.save(prefs);
                return prefs;
            }
        } catch (e) {
            console.warn('FitnessUserPrefs.hydrate failed', e);
        }
        return this.load();
    },

    async syncToRemote(client, userId, prefs) {
        if (!client || !userId) return { error: new Error('Missing client or user') };
        const payload = prefs || this.load();
        return client
            .from('profiles')
            .update({ layout_prefs: payload })
            .eq('id', userId);
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
