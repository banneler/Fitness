/**
 * Arena rank history — detect leaderboard position changes and display a community timeline.
 */
const FitnessArenaHistory = {
    SNAPSHOT_KEY: 'constellation_arena_full_ranks',
    LOCAL_HISTORY_KEY: 'constellation_arena_rank_history',
    METRICS: ['volume', 'sessions', 'streak'],
    MAX_LOCAL_EVENTS: 300,

    buildFullSnapshot(users) {
        const snap = { at: Date.now(), metrics: {} };
        this.METRICS.forEach(metric => {
            const sorted = FitnessSocial.sortLeaderboardByMetric(users, metric);
            snap.metrics[metric] = sorted.map(u => u.user_id);
        });
        return snap;
    },

    loadSnapshot() {
        try {
            const raw = localStorage.getItem(this.SNAPSHOT_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    saveSnapshot(snapshot) {
        try {
            localStorage.setItem(this.SNAPSHOT_KEY, JSON.stringify(snapshot));
        } catch (e) { /* ignore quota */ }
    },

    loadLocalHistory() {
        try {
            const raw = localStorage.getItem(this.LOCAL_HISTORY_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },

    appendLocalHistory(events) {
        if (!events?.length) return;
        const merged = [...events, ...this.loadLocalHistory()]
            .sort((a, b) => new Date(b.created_at || b.at) - new Date(a.created_at || a.at))
            .slice(0, this.MAX_LOCAL_EVENTS);
        try {
            localStorage.setItem(this.LOCAL_HISTORY_KEY, JSON.stringify(merged));
        } catch (e) { /* ignore quota */ }
    },

    diffSnapshots(prev, next) {
        const events = [];
        if (!prev?.metrics) return events;
        const at = new Date(next.at).toISOString();

        this.METRICS.forEach(metric => {
            const prevOrder = prev.metrics[metric] || [];
            const nextOrder = next.metrics[metric] || [];

            if (prevOrder[0] && nextOrder[0] && prevOrder[0] !== nextOrder[0]) {
                events.push({
                    event_type: 'crown_change',
                    metric,
                    previous_leader_id: prevOrder[0],
                    new_leader_id: nextOrder[0],
                    created_at: at
                });
            }

            nextOrder.forEach((userId, idx) => {
                const newRank = idx + 1;
                const oldIdx = prevOrder.indexOf(userId);
                if (oldIdx === -1) {
                    events.push({
                        event_type: 'entered',
                        metric,
                        user_id: userId,
                        new_rank: newRank,
                        created_at: at
                    });
                } else if (oldIdx !== idx) {
                    events.push({
                        event_type: 'rank_change',
                        metric,
                        user_id: userId,
                        old_rank: oldIdx + 1,
                        new_rank: newRank,
                        created_at: at
                    });
                }
            });
        });

        return events;
    },

    toDbRow(event) {
        return {
            event_type: event.event_type,
            metric: event.metric,
            user_id: event.user_id || null,
            previous_leader_id: event.previous_leader_id || null,
            new_leader_id: event.new_leader_id || null,
            old_rank: event.old_rank ?? null,
            new_rank: event.new_rank ?? null,
            created_at: event.created_at
        };
    },

    fromDbRow(row) {
        return { ...row, id: row.id || `${row.event_type}-${row.metric}-${row.created_at}` };
    },

    buildOpeningBoardEvents(users) {
        const base = Date.now();
        const events = [];
        this.METRICS.forEach((metric, mi) => {
            const sorted = FitnessSocial.sortLeaderboardByMetric(users, metric);
            if (sorted[0]) {
                events.push({
                    event_type: 'season_open',
                    metric,
                    new_leader_id: sorted[0].user_id,
                    created_at: new Date(base + mi * 1000).toISOString()
                });
            }
            sorted.forEach((u, idx) => {
                events.push({
                    event_type: 'entered',
                    metric,
                    user_id: u.user_id,
                    new_rank: idx + 1,
                    created_at: new Date(base - 120000 - idx * 500).toISOString()
                });
            });
        });
        return events;
    },

    async seedOpeningBoardIfEmpty(client, users) {
        if (!users?.length) return false;
        const { count, error } = await client
            .from('arena_rank_events')
            .select('*', { count: 'exact', head: true });
        if (error?.code === '42P01' || (count ?? 0) > 0) return false;

        const events = this.buildOpeningBoardEvents(users);
        const { error: insertError } = await client
            .from('arena_rank_events')
            .insert(events.map(e => this.toDbRow(e)));
        return !insertError;
    },

    async recordChanges(client, users) {
        const prev = this.loadSnapshot();
        const next = this.buildFullSnapshot(users);
        const events = this.diffSnapshots(prev, next);

        if (!prev) {
            this.saveSnapshot(next);
            return [];
        }

        this.saveSnapshot(next);
        if (!events.length) return [];

        const rows = events.map(e => this.toDbRow(e));
        const { error } = await client.from('arena_rank_events').insert(rows);
        if (error?.code === '42P01' || error) {
            this.appendLocalHistory(events.map((e, i) => ({
                ...e,
                id: `local-${Date.now()}-${i}`
            })));
        }
        return events;
    },

    async fetchFeed(client, limit = 80) {
        const { data, error } = await client
            .from('arena_rank_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (!error && data?.length) {
            return { events: data.map(r => this.fromDbRow(r)), source: 'db', tableMissing: false };
        }
        if (error?.code === '42P01') {
            return {
                events: this.loadLocalHistory().slice(0, limit),
                source: 'local',
                tableMissing: true
            };
        }
        return {
            events: this.loadLocalHistory().slice(0, limit),
            source: 'local',
            tableMissing: false
        };
    },

    name(profileMap, userId) {
        if (!userId) return 'Someone';
        return profileMap[userId]?.full_name || profileMap[userId]?.initials || 'Athlete';
    },

    formatEvent(event, profileMap = {}) {
        const metricLabel = FitnessSocial.contextLabel(event.metric);
        const emoji = FitnessSocial.contextEmoji(event.metric);
        const when = FitnessSocial.formatCommentTime(event.created_at);

        if (event.event_type === 'season_open') {
            const leader = this.name(profileMap, event.new_leader_id);
            return {
                headline: `${metricLabel} board opens`,
                detail: `${leader} leads the pack · ${emoji}`,
                when,
                metric: event.metric,
                tone: 'crown',
                emoji: '🏁'
            };
        }

        if (event.event_type === 'crown_change') {
            const usurper = this.name(profileMap, event.new_leader_id);
            const former = this.name(profileMap, event.previous_leader_id);
            return {
                headline: `${usurper} took the ${metricLabel} crown`,
                detail: `From ${former} · ${emoji}`,
                when,
                metric: event.metric,
                tone: 'crown',
                emoji: '👑'
            };
        }

        if (event.event_type === 'entered') {
            const athlete = this.name(profileMap, event.user_id);
            return {
                headline: `${athlete} entered the ${metricLabel} board`,
                detail: `Debuts at #${event.new_rank} · ${emoji}`,
                when,
                metric: event.metric,
                tone: 'neutral',
                emoji: '📊'
            };
        }

        const athlete = this.name(profileMap, event.user_id);
        const dir = event.new_rank < event.old_rank ? 'climbed' : 'dropped';
        const arrow = event.new_rank < event.old_rank ? '↑' : '↓';
        return {
            headline: `${athlete} ${dir} on ${metricLabel}`,
            detail: `#${event.old_rank} → #${event.new_rank} ${arrow} · ${emoji}`,
            when,
            metric: event.metric,
            tone: event.new_rank < event.old_rank ? 'up' : 'down',
            emoji: arrow
        };
    }
};
