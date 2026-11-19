/** Bryan Anneler — owns the global standard exercise library. */
window.FITNESS_STANDARD_LIBRARY_OWNER_ID = '6f471a6f-3697-4826-a0d8-34404ea5980d';

/**
 * localStorage / sessionStorage keys.
 * New installs use the ba_fitness_* names. Existing phones still have
 * constellation_* values; reads copy those forward so an in-progress
 * workout is not dropped when the names change.
 */
window.FitnessKeys = {
    activeSession: ['ba_fitness_active_session', 'constellation_active_session'],
    pendingLogs: ['ba_fitness_pending_logs', 'constellation_pending_logs'],
    finishQueue: ['ba_fitness_finish_queue', 'constellation_finish_queue'],
    arenaFullRanks: ['ba_fitness_arena_full_ranks', 'constellation_arena_full_ranks'],
    arenaRankHistory: ['ba_fitness_arena_rank_history', 'constellation_arena_rank_history'],
    arenaRanks: ['ba_fitness_arena_ranks', 'constellation_arena_ranks'],
    userPrefs: ['ba_fitness_user_prefs', 'constellation_user_prefs']
};

window.FitnessStorage = {
    read(key, legacyKey, store) {
        const box = store || localStorage;
        try {
            const current = box.getItem(key);
            if (current != null) return current;
            if (!legacyKey) return null;
            const legacy = box.getItem(legacyKey);
            if (legacy == null) return null;
            box.setItem(key, legacy);
            return legacy;
        } catch (e) {
            return null;
        }
    },

    write(key, legacyKey, value, store) {
        const box = store || localStorage;
        box.setItem(key, value);
        if (legacyKey) {
            try { box.removeItem(legacyKey); } catch (e) { /* ignore */ }
        }
    },

    remove(key, legacyKey, store) {
        const box = store || localStorage;
        try { box.removeItem(key); } catch (e) { /* ignore */ }
        if (legacyKey) {
            try { box.removeItem(legacyKey); } catch (e) { /* ignore */ }
        }
    }
};

window.FitnessAuth = {
    friendlyError(message) {
        const msg = String(message || '').toLowerCase();
        if (!msg) return 'Something went wrong. Try again.';
        if (msg.includes('missing email') || msg.includes('phone')) return 'Enter your email and a password.';
        if (msg.includes('invalid login') || msg.includes('invalid credentials')) return 'That email and password don’t match.';
        if (msg.includes('email not confirmed')) return 'Check your inbox and confirm your email, then log in.';
        if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already')) return 'That email already has an account. Log in instead.';
        if (msg.includes('password') && (msg.includes('6') || msg.includes('least') || msg.includes('short') || msg.includes('weak'))) return 'Use a password with at least 6 characters.';
        if (msg.includes('same password') || msg.includes('different from the old')) return 'Choose a new password you have not used here before.';
        if (msg.includes('rate') || msg.includes('too many') || msg.includes('security purposes') || msg.includes('only request this')) return 'Too many attempts. Wait a minute, then try again.';
        if (msg.includes('unable to validate email') || msg.includes('invalid format') || msg.includes('valid email') || msg.includes('email address')) return 'That email doesn’t look right. Check it and try again.';
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) return 'Can’t reach BA Fitness right now. Check your connection.';
        if (msg.includes('signup') && msg.includes('disabled')) return 'New accounts are turned off right now.';
        if (msg.includes('password') && msg.includes('match')) return 'Those passwords don’t match.';
        return 'Something went wrong. Try again.';
    }
};

/**
 * The installed iOS home-screen app broke when a service worker cached the
 * shell (stale or blank launch). sw.js is intentionally not registered.
 * Entry pages drop any worker left from an older visit.
 */
window.FitnessPwa = {
    async disableStaleWorker() {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(reg => reg.unregister()));
        } catch (e) { /* ignore */ }
    }
};

/** Bridge freshly saved workout logs into pages that fetch history immediately after redirect. */
window.FitnessWorkoutSync = {
    get PENDING_KEY() { return window.FitnessKeys.pendingLogs[0]; },
    get QUEUE_KEY() { return window.FitnessKeys.finishQueue[0]; },

    stashPending(logs) {
        if (!logs?.length) return;
        const [key, legacy] = window.FitnessKeys.pendingLogs;
        window.FitnessStorage.write(key, legacy, JSON.stringify(logs), sessionStorage);
    },

    mergeFetched(fetched) {
        const [key, legacy] = window.FitnessKeys.pendingLogs;
        const raw = window.FitnessStorage.read(key, legacy, sessionStorage);
        if (!raw) return fetched || [];
        window.FitnessStorage.remove(key, legacy, sessionStorage);
        try {
            const pending = JSON.parse(raw);
            const list = [...(fetched || [])];
            const keys = new Set(list.map(log => `${log.session_id || ''}|${log.exercise_name}|${log.created_at}`));
            pending.forEach(log => {
                const id = `${log.session_id || ''}|${log.exercise_name}|${log.created_at}`;
                if (!keys.has(id)) {
                    list.unshift(log);
                    keys.add(id);
                }
            });
            return list;
        } catch (e) {
            console.warn('Pending workout merge failed', e);
            return fetched || [];
        }
    },

    loadQueue() {
        const [key, legacy] = window.FitnessKeys.finishQueue;
        const raw = window.FitnessStorage.read(key, legacy);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    },

    saveQueue(queue) {
        const [key, legacy] = window.FitnessKeys.finishQueue;
        window.FitnessStorage.write(key, legacy, JSON.stringify(queue || []));
    },

    /**
     * Replace any earlier attempt for the same session so Retry sends the latest sets.
     */
    enqueueFinish(item) {
        if (!item?.sessionId || !item.logs?.length) return;
        const queue = this.loadQueue().filter(row => row.sessionId !== item.sessionId);
        queue.push({
            sessionId: item.sessionId,
            logs: item.logs,
            stackTaken: !!item.stackTaken,
            isRecovery: !!item.isRecovery,
            userId: item.userId || null,
            queuedAt: item.queuedAt || Date.now(),
            logsSaved: false,
            stackApplied: false
        });
        this.saveQueue(queue);
    },

    readActiveSession() {
        const [key, legacy] = window.FitnessKeys.activeSession;
        const raw = window.FitnessStorage.read(key, legacy);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    },

    /**
     * Skip auto-save when the athlete changed the workout after tapping Finish.
     * They need to tap Finish again so the saved sets match the screen.
     */
    editedAfterQueue(item) {
        const session = this.readActiveSession();
        if (!session || !item) return false;
        if (session.pendingFinishSessionId && session.pendingFinishSessionId !== item.sessionId) return false;
        const updatedAt = session.updatedAt || 0;
        const queuedAt = item.queuedAt || 0;
        return updatedAt > queuedAt + 1500;
    },

    clearActiveSession(sessionId) {
        const session = this.readActiveSession();
        if (session?.pendingFinishSessionId && sessionId && session.pendingFinishSessionId !== sessionId) return;
        const [key, legacy] = window.FitnessKeys.activeSession;
        window.FitnessStorage.remove(key, legacy);
    },

    async sessionAlreadySaved(client, sessionId) {
        if (!sessionId) return false;
        const { data, error } = await client.from('workout_logs').select('id').eq('session_id', sessionId).limit(1);
        if (error) {
            const msg = `${error.message || ''} ${error.code || ''}`;
            if (msg.includes('session_id') || error.code === '42703') return false;
            throw error;
        }
        return !!(data && data.length);
    },

    async flush(client) {
        const queue = this.loadQueue();
        if (!queue.length) return { saved: 0, pending: 0, skipped: 0 };
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return { saved: 0, pending: queue.length, skipped: 0, offline: true };
        }
        const remain = [];
        let saved = 0;
        let skipped = 0;
        let lastError = null;
        for (let i = 0; i < queue.length; i++) {
            const item = queue[i];
            if (this.editedAfterQueue(item)) {
                skipped += 1;
                remain.push(item);
                continue;
            }
            try {
                if (!item.logsSaved) {
                    const exists = await this.sessionAlreadySaved(client, item.sessionId);
                    if (!exists) {
                        const { error } = await client.from('workout_logs').insert(item.logs);
                        if (error) throw error;
                    }
                    item.logsSaved = true;
                    this.stashPending(item.logs);
                }
                if (!item.isRecovery && !item.prsRecorded && typeof FitnessArenaPrs !== 'undefined') {
                    try {
                        await FitnessArenaPrs.recordSessionPrs(client, item.userId, item.logs);
                        item.prsRecorded = true;
                    } catch (e) {
                        console.error('PR recording failed', e);
                    }
                }
                if (item.stackTaken && !item.stackApplied) {
                    const { data: inv, error: invErr } = await client.from('inventory').select('id, servings_left');
                    if (invErr) throw invErr;
                    if (inv?.length) {
                        await Promise.all(inv.map(row => client.from('inventory').update({
                            servings_left: Math.max(0, (row.servings_left || 0) - 1)
                        }).eq('id', row.id)));
                    }
                    item.stackApplied = true;
                }
                saved += 1;
                this.clearActiveSession(item.sessionId);
            } catch (e) {
                lastError = e;
                remain.push(item);
            }
            this.saveQueue(remain.concat(queue.slice(i + 1)));
        }
        this.saveQueue(remain);
        return { saved, pending: remain.length, skipped, offline: false, error: lastError };
    },

    failureMessage(result) {
        if (result?.offline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
            return 'You’re offline. This workout is still on this phone. We’ll save it automatically when you’re back online, or tap Retry.';
        }
        return 'Couldn’t save this workout. Your sets are still on this phone. Tap Retry — we’ll also try again when you’re back online.';
    }
};

/** Parse Supabase edge function errors into user-readable messages. */
window.FitnessEdge = {
    async parseInvokeError(error, data) {
        if (data?.error) return data.error;
        if (error?.context && typeof error.context.json === 'function') {
            try {
                const body = await error.context.json();
                if (body?.error) return body.error;
            } catch (_) { /* ignore */ }
        }
        const msg = error?.message || '';
        if (msg.includes('non-2xx')) return 'AI service error — try again in a moment.';
        return msg || 'Neural link failed';
    }
};
