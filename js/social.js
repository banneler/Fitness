/**
 * Lightweight social helpers for BA Fitness — workout recaps, share, arena likes/comments.
 */
const FitnessSocial = {
    formatDuration(seconds) {
        if (!seconds || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    },

    formatNumber(num) {
        const n = parseInt(num, 10) || 0;
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    calculateStreak(logs) {
        const dates = [...new Set((logs || []).map(l => l.created_at.split('T')[0]))].sort().reverse();
        let streak = 0;
        const today = new Date().toLocaleDateString('en-CA');
        const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
        if (!dates.includes(today) && !dates.includes(yesterday)) return 0;
        let d = dates.includes(today) ? new Date() : new Date(Date.now() - 86400000);
        while (dates.includes(d.toLocaleDateString('en-CA'))) {
            streak++;
            d.setDate(d.getDate() - 1);
        }
        return streak;
    },

    setLabel(set, isBodyWeight) {
        return this.formatSetLabel(set, isBodyWeight).text;
    },

    isSetFailure(set) {
        return !!set && (set.failure === true || set.failure === 1 || set.failure === 'true');
    },

    /** Lucide skull — matches workout.html failure checkbox */
    failureSkullMarkup() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="-2 -2 28 28" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;overflow:visible;"><circle cx="9" cy="12" r="1" fill="#ef4444" stroke="none"/><circle cx="15" cy="12" r="1" fill="#ef4444" stroke="none"/><path d="M8 20v2h8v-2"/><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M16 20a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20"/></svg>`;
    },

    formatLiftSetsRow(sets) {
        return (sets || []).map((s, i) => {
            const html = typeof s === 'string' ? s : s.html;
            const sep = i > 0 ? `<span style="color:rgba(59,130,246,0.45);padding:0 5px;line-height:1;">·</span>` : '';
            return `${sep}<span style="display:inline-flex;align-items:center;line-height:1;">${html}</span>`;
        }).join('');
    },

    buildStreakBadgeHtml(streak) {
        if (!streak || streak <= 0) return '';
        return `<div style="background:rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.35);border-radius:12px;padding:8px 12px;min-width:54px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;flex-shrink:0;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#f97316" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex-shrink:0;"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg><div style="font-size:10px;font-weight:900;color:#f97316;margin-top:4px;line-height:1;text-align:center;width:100%;">${streak} DAY</div></div>`;
    },

    formatSetLabel(set, isBodyWeight) {
        const reps = parseInt(set.reps, 10) || 0;
        if (!reps) return null;
        const weight = parseFloat(set.weight);
        const wLabel = isNaN(weight) || weight === 0 ? 'BW' : weight;
        const failed = this.isSetFailure(set);
        const label = `${wLabel}×${reps}`;
        const html = failed
            ? `<span style="display:inline-flex;align-items:center;gap:4px;line-height:1;">${label}${this.failureSkullMarkup()}</span>`
            : label;
        return { text: label, html };
    },

    setLabelHtml(set, isBodyWeight) {
        const formatted = this.formatSetLabel(set, isBodyWeight);
        return formatted ? formatted.html : null;
    },

    findSessionLogs(rawWorkouts, startTime, windowMs = 3600000, anchorId = null) {
        let t = parseInt(startTime, 10);
        if (anchorId && rawWorkouts?.length) {
            const anchor = rawWorkouts.find(log => log.id === anchorId);
            if (anchor) t = new Date(anchor.created_at).getTime();
        }
        if (!t || !rawWorkouts?.length) return [];
        const matched = rawWorkouts.filter(log => {
            const logTime = new Date(log.created_at).getTime();
            return Math.abs(logTime - t) <= windowMs;
        });
        if (matched.length) return matched;
        if (!anchorId) return [];
        const anchor = rawWorkouts.find(log => log.id === anchorId);
        return anchor ? [anchor] : [];
    },

    computeFromActiveRoutine(activeRoutine, sessionTimer) {
        let tonnage = 0;
        let setCount = 0;
        let exerciseCount = 0;
        const liftLines = [];

        (activeRoutine?.data || []).forEach(group => {
            (group.exercises || []).forEach(ex => {
                const doneSets = (ex.sets || []).filter(s => s.done);
                if (!doneSets.length) return;

                exerciseCount++;
                const sets = [];
                doneSets.forEach(s => {
                    const w = parseFloat(s.weight) || 0;
                    const r = parseInt(s.reps, 10) || 0;
                    tonnage += w * r;
                    setCount++;
                    const formatted = this.formatSetLabel(s, ex.weightType === 'bodyweight' || ex.weightType === true);
                    if (formatted) sets.push(formatted);
                });
                if (sets.length) liftLines.push({ name: ex.name, sets });
            });
        });

        return {
            protocolName: activeRoutine?.name || 'Workout',
            durationSeconds: sessionTimer || 0,
            tonnage,
            setCount,
            exerciseCount,
            liftLines
        };
    },

    computeFromSessionLogs(logs, sessionMeta = {}) {
        let tonnage = 0;
        let setCount = 0;
        const liftLines = [];
        const exercises = new Set();

        (logs || []).forEach(log => {
            exercises.add(log.exercise_name);
            const sets = [];
            (log.sets_data || []).forEach(s => {
                const w = parseFloat(s.weight) || 0;
                const r = parseInt(s.reps, 10) || 0;
                tonnage += w * r;
                setCount++;
                const formatted = this.formatSetLabel(s);
                if (formatted) sets.push(formatted);
            });
            if (sets.length) liftLines.push({ name: log.exercise_name, sets });
        });

        return {
            protocolName: sessionMeta.protocol_name || logs?.[0]?.protocol_name || 'Workout',
            durationSeconds: sessionMeta.duration || logs?.[0]?.duration_seconds || 0,
            tonnage,
            setCount,
            exerciseCount: exercises.size,
            liftLines
        };
    },

    /** Plain-text fallback when image share is unavailable */
    buildFallbackText({ athleteName, protocolName, durationSeconds, tonnage, setCount, exerciseCount, liftLines, streak }) {
        const who = athleteName || 'Athlete';
        let msg = `BA FITNESS — ${who}\n${protocolName || 'Workout'}\n\n`;
        msg += `${this.formatDuration(durationSeconds)} · ${this.formatNumber(tonnage)} lbs · ${setCount} sets · ${exerciseCount} exercises`;
        if (streak > 0) msg += ` · ${streak}-day streak`;
        if (liftLines?.length) {
            msg += '\n\n';
            liftLines.forEach(line => {
                const setText = (s) => (typeof s === 'string' ? s : s.text);
                msg += `${line.name}: ${line.sets.map(setText).join(', ')}\n`;
            });
        }
        msg += '\nThe Arena awaits 🏆';
        return msg.trim();
    },

    rankLabel(rank) {
        if (rank === 0) return '1st';
        if (rank === 1) return '2nd';
        if (rank === 2) return '3rd';
        return `#${rank + 1}`;
    },

    rankTheme(rank) {
        if (rank === 0) return { accent: '#facc15', border: 'rgba(250,204,21,0.45)', glow: 'rgba(250,204,21,0.15)', label: 'GOLD' };
        if (rank === 1) return { accent: '#cbd5e1', border: 'rgba(203,213,225,0.45)', glow: 'rgba(203,213,225,0.12)', label: 'SILVER' };
        if (rank === 2) return { accent: '#fdba74', border: 'rgba(253,186,116,0.45)', glow: 'rgba(253,186,116,0.12)', label: 'BRONZE' };
        return { accent: '#a855f7', border: 'rgba(168,85,247,0.35)', glow: 'rgba(168,85,247,0.12)', label: 'CONTENDER' };
    },

    metricShareMeta(metric) {
        return ({
            volume: { title: 'Volume Leader', statCaption: 'LBS MOVED THIS WEEK', color: '#a855f7' },
            sessions: { title: 'Consistency Leader', statCaption: 'SESSIONS THIS WEEK', color: '#3b82f6' },
            streak: { title: 'Streak Leader', statCaption: 'DAY STREAK', color: '#f97316' }
        })[metric] || { title: 'Arena Standings', statCaption: 'LAST 7 DAYS', color: '#a855f7' };
    },

    ARENA_SNAPSHOT_KEY: 'constellation_arena_ranks',
    ARENA_METRICS: ['volume', 'sessions', 'streak'],

    sortLeaderboardByMetric(users, metric) {
        return [...(users || [])].sort((a, b) => {
            if (metric === 'volume') return (b.total_volume || 0) - (a.total_volume || 0);
            if (metric === 'sessions') return (b.sessions_count || 0) - (a.sessions_count || 0);
            return (b.current_streak || 0) - (a.current_streak || 0);
        });
    },

    getLeaderboardRank(sorted, userId) {
        const idx = sorted.findIndex(u => u.user_id === userId);
        return idx >= 0 ? idx : -1;
    },

    buildArenaSnapshot(users, userId) {
        const snapshot = { at: Date.now() };
        this.ARENA_METRICS.forEach(metric => {
            const sorted = this.sortLeaderboardByMetric(users, metric);
            const leader = sorted[0];
            snapshot[metric] = {
                rank: this.getLeaderboardRank(sorted, userId),
                leaderId: leader?.user_id || null
            };
        });
        return snapshot;
    },

    loadArenaSnapshot() {
        try {
            const raw = localStorage.getItem(this.ARENA_SNAPSHOT_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    saveArenaSnapshot(snapshot) {
        try {
            localStorage.setItem(this.ARENA_SNAPSHOT_KEY, JSON.stringify(snapshot));
        } catch (e) { /* ignore quota */ }
    },

    detectArenaOverthrows(prev, users, userId, profileMap = {}) {
        if (!prev) return [];
        const events = [];
        this.ARENA_METRICS.forEach(metric => {
            if (prev[metric]?.rank !== 0) return;
            const sorted = this.sortLeaderboardByMetric(users, metric);
            const currentRank = this.getLeaderboardRank(sorted, userId);
            if (currentRank === 0) return;
            const leader = sorted[0];
            if (!leader || leader.user_id === userId) return;
            const profile = profileMap[leader.user_id] || leader;
            const meta = this.metricShareMeta(metric);
            events.push({
                metric,
                usurperName: profile.full_name || profile.initials || 'Someone',
                title: meta.title,
                color: meta.color,
                emoji: this.contextEmoji(metric)
            });
        });
        return events;
    },

    isArenaLeader(users, userId, metric) {
        const sorted = this.sortLeaderboardByMetric(users, metric);
        return sorted[0]?.user_id === userId;
    },

    buildCoronationEvent(metric) {
        const meta = this.metricShareMeta(metric);
        return {
            metric,
            title: meta.title,
            caption: meta.statCaption,
            color: meta.color,
            emoji: this.contextEmoji(metric)
        };
    },

    buildShareStatHeroBlock({
        top,
        score,
        bottom,
        topColor = '#facc15',
        scoreColor = '#ffffff',
        bottomColor = '#64748b',
        topSize = 13,
        scoreSize = 48,
        scoreNudge = -22,
        background = 'rgba(15,23,42,0.75)',
        border = '1px solid rgba(255,255,255,0.08)',
        marginBottom = 18
    }) {
        return `<div style="background:${background};border-radius:22px;padding:18px 20px 20px;border:${border};text-align:center;margin-bottom:${marginBottom}px;box-sizing:border-box;"><div style="font-size:${topSize}px;font-weight:900;color:${topColor};letter-spacing:0.08em;line-height:1.2;margin:0 0 14px;">${top}</div><div style="font-size:${scoreSize}px;font-weight:900;font-style:italic;line-height:1;color:${scoreColor};margin:0 0 14px;transform:translateY(${scoreNudge}px);">${score}</div><div style="font-size:9px;font-weight:800;color:${bottomColor};letter-spacing:0.08em;line-height:1.2;margin:0;">${bottom}</div></div>`;
    },

    buildShareDualLineCell(topLine, bottomLine, minHeight = 56, padY = 14) {
        return `<div style="background:rgba(15,23,42,0.85);border-radius:14px;border:1px solid rgba(255,255,255,0.07);box-sizing:border-box;height:${minHeight}px;text-align:center;padding:${padY}px 10px;line-height:1.2;overflow:hidden;">${topLine}${bottomLine}</div>`;
    },

    buildShareMetaCell(label, value, valueColor = '#e2e8f0') {
        return this.buildShareDualLineCell(
            `<div style="font-size:8px;font-weight:800;color:#64748b;letter-spacing:0.08em;margin-bottom:4px;">${label}</div>`,
            `<div style="font-size:11px;font-weight:900;color:${valueColor};text-transform:uppercase;">${value}</div>`
        );
    },

    buildShareMiniStatCell(value, label) {
        return this.buildShareDualLineCell(
            `<div style="font-size:17px;font-weight:900;line-height:1;color:#ffffff;margin-bottom:4px;">${value}</div>`,
            `<div style="font-size:6px;font-weight:800;color:#64748b;letter-spacing:0.08em;line-height:1;">${label}</div>`
        );
    },

    buildShareCardHeader({ kicker = 'BA FITNESS · THE ARENA', name, subtitle, subtitleColor, nameGap = 3, marginBottom = 14, streakBadgeHtml = '' }) {
        const textBlock = `<div style="line-height:1;"><div style="font-size:8px;font-weight:900;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;line-height:1;margin:0 0 ${nameGap}px;">${kicker}</div><div style="font-size:24px;font-weight:900;font-style:italic;text-transform:uppercase;line-height:1.05;color:#ffffff;margin:0 0 ${nameGap}px;">${name}</div><div style="font-size:11px;font-weight:800;color:${subtitleColor};text-transform:uppercase;letter-spacing:0.08em;line-height:1;margin:0;">${subtitle}</div></div>`;
        if (streakBadgeHtml) {
            return `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:${marginBottom}px;">${textBlock}${streakBadgeHtml}</div>`;
        }
        return `<div style="margin-bottom:${marginBottom}px;">${textBlock}</div>`;
    },

    buildStreakShareCardHtml({ athleteName, streakDays }) {
        const who = athleteName || 'Athlete';
        const days = parseInt(streakDays, 10) || 0;
        const header = this.buildShareCardHeader({
            name: who,
            subtitle: 'Streak Champion',
            subtitleColor: '#f97316'
        });
        const hero = this.buildShareStatHeroBlock({
            top: '🔥',
            score: days,
            bottom: 'DAY STREAK',
            topColor: '#f97316',
            scoreColor: '#f97316',
            bottomColor: '#fdba74',
            topSize: 40,
            scoreSize: 56,
            scoreNudge: -26,
            background: 'rgba(15,23,42,0.65)',
            border: '1px solid rgba(249,115,22,0.25)',
            marginBottom: 20
        });
        return `<div style="width:380px;background:linear-gradient(165deg,#1c1917 0%,#020617 45%,#431407 100%);border-radius:28px;padding:10px 22px 22px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:white;box-sizing:border-box;border:1px solid rgba(249,115,22,0.45);overflow:hidden;line-height:1;">${header}${hero}<div style="background:rgba(249,115,22,0.08);border-radius:16px;padding:14px 16px;border:1px solid rgba(249,115,22,0.2);text-align:center;margin-bottom:8px;"><div style="font-size:11px;font-weight:900;color:#fed7aa;letter-spacing:0.08em;text-transform:uppercase;font-style:italic;">Consistency is King</div></div><div style="text-align:center;margin-top:18px;font-size:9px;font-weight:900;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">The Arena Awaits 🏆</div></div>`;
    },

    buildRankingShareCardHtml({ athleteName, rank, metric, score, unit, metricLabel }) {
        const who = athleteName || 'Athlete';
        const theme = this.rankTheme(rank);
        const meta = this.metricShareMeta(metric);
        const rankText = this.rankLabel(rank).toUpperCase();
        const placeLine = rank <= 2 ? `${rankText} PLACE` : `${rankText} IN THE ARENA`;
        const header = this.buildShareCardHeader({
            name: who,
            subtitle: meta.title,
            subtitleColor: meta.color
        });
        const hero = this.buildShareStatHeroBlock({
            top: placeLine,
            score,
            bottom: meta.statCaption,
            topColor: theme.accent,
            scoreColor: '#ffffff',
            scoreSize: 48,
            scoreNudge: -22
        });

        return `<div style="width:380px;background:linear-gradient(165deg,#0f172a 0%,#020617 50%,#1e1b4b 100%);border-radius:28px;padding:10px 22px 22px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:white;box-sizing:border-box;border:1px solid ${theme.border};overflow:hidden;line-height:1;">${header}${hero}<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;">${this.buildShareMetaCell('METRIC', metricLabel || meta.title, meta.color)}${this.buildShareMetaCell('WINDOW', 'Last 7 Days', '#e2e8f0')}</div><div style="text-align:center;margin-top:18px;font-size:9px;font-weight:900;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">The Arena Awaits 🏆</div></div>`;
    },

    buildStreakFallbackText({ athleteName, streakDays }) {
        const name = athleteName || 'I';
        return `🔥 ${name} is on a ${streakDays}-day workout streak in BA Fitness!\n\nConsistency is king. See you in The Arena 🏆`;
    },

    buildRankingFallbackText({ athleteName, rank, metric, score, unit }) {
        const name = athleteName || 'I';
        const rankLabel = this.rankLabel(rank);
        const meta = this.metricShareMeta(metric);
        return `🏆 ${name} is sitting ${rankLabel} on the BA Fitness leaderboard!\n\n${score} · ${meta.statCaption.toLowerCase()}\n\nCome get yours in The Arena 💪`;
    },

    stripEmptyTextNodes(node) {
        if (!node) return;
        [...node.childNodes].forEach(child => {
            if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) child.remove();
            else if (child.nodeType === Node.ELEMENT_NODE) this.stripEmptyTextNodes(child);
        });
    },

    async captureHtmlCard(html) {
        if (typeof html2canvas === 'undefined') return null;
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:0;top:0;transform:translateX(-10000px);z-index:-1;';
        host.innerHTML = html;
        document.body.appendChild(host);
        const card = host.firstElementChild;
        if (card) this.stripEmptyTextNodes(card);
        try {
            await new Promise(r => setTimeout(r, 150));
            const canvas = await html2canvas(card, {
                backgroundColor: '#020617',
                scale: 2,
                useCORS: true,
                logging: false
            });
            return await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.92));
        } finally {
            document.body.removeChild(host);
        }
    },

    async shareImageCard({ html, fallbackText, filename = 'ba-fitness-arena.png' }) {
        const blob = await this.captureHtmlCard(html);

        if (blob && navigator.share) {
            const file = new File([blob], filename, { type: 'image/png' });
            const filePayload = { files: [file] };
            if (!navigator.canShare || navigator.canShare(filePayload)) {
                try {
                    await navigator.share(filePayload);
                    return 'shared-image';
                } catch (err) {
                    if (err?.name === 'AbortError') return 'cancelled';
                }
            }
        }

        return this.shareText(fallbackText);
    },

    async shareStreakCard(options) {
        const html = this.buildStreakShareCardHtml(options);
        const fallbackText = this.buildStreakFallbackText(options);
        return this.shareImageCard({ html, fallbackText, filename: 'ba-fitness-streak.png' });
    },

    async shareRankingCard(options) {
        const html = this.buildRankingShareCardHtml(options);
        const fallbackText = this.buildRankingFallbackText(options);
        return this.shareImageCard({ html, fallbackText, filename: 'ba-fitness-rank.png' });
    },

    buildShareCardHtml({ athleteName, protocolName, durationSeconds, tonnage, setCount, exerciseCount, liftLines, streak, bodySvgHtml, heatmapStatuses, animalRowHtml }) {
        const who = athleteName || 'Athlete';
        const proto = protocolName || 'Workout';
        const legend = typeof FitnessHeatmap !== 'undefined'
            ? FitnessHeatmap.legendHtml(heatmapStatuses || {})
            : '';

        const liftRows = (liftLines || []).map(line => `
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:10px;font-weight:800;color:#e2e8f0;text-transform:uppercase;font-style:italic;margin-bottom:3px;">${line.name}</div>
                <div style="font-size:11px;font-weight:900;color:#3b82f6;letter-spacing:0.04em;display:flex;flex-wrap:wrap;align-items:center;row-gap:4px;line-height:1;overflow:visible;">${this.formatLiftSetsRow(line.sets)}</div>
            </div>`).join('');

        const streakBadgeHtml = this.buildStreakBadgeHtml(streak);
        const header = this.buildShareCardHeader({
            kicker: 'BA FITNESS',
            name: who,
            subtitle: proto,
            subtitleColor: '#3b82f6',
            marginBottom: 10,
            streakBadgeHtml
        });

        return `<div style="width:380px;background:linear-gradient(165deg,#0f172a 0%,#020617 50%,#1e1b4b 100%);border-radius:28px;padding:10px 22px 22px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:white;box-sizing:border-box;border:1px solid rgba(59,130,246,0.3);overflow:hidden;line-height:1;">${header}

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;">${this.buildShareMiniStatCell(this.formatDuration(durationSeconds), 'DURATION')}${this.buildShareMiniStatCell(this.formatNumber(tonnage), 'LBS MOVED')}${this.buildShareMiniStatCell(setCount, `SETS · ${exerciseCount} EX`)}</div>

            ${liftRows ? `<div style="background:rgba(15,23,42,0.55);border-radius:18px;padding:16px;margin-bottom:18px;border:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:8px;font-weight:900;color:#64748b;letter-spacing:0.22em;margin-bottom:2px;">THE WORK</div>
                ${liftRows}
            </div>` : ''}

            ${animalRowHtml || ''}

            <div style="background:rgba(15,23,42,0.65);border-radius:18px;padding:16px;border:1px solid rgba(59,130,246,0.2);">
                <div style="font-size:8px;font-weight:900;color:#3b82f6;letter-spacing:0.22em;margin-bottom:10px;">SYSTEM STATUS</div>
                <div style="margin-bottom:10px;text-align:center;">${legend}</div>
                <div style="width:100%;text-align:center;line-height:0;padding:10px 0 8px;overflow:visible;">${bodySvgHtml || ''}</div>
            </div>

            <div style="text-align:center;margin-top:20px;font-size:9px;font-weight:900;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">The Arena Awaits 🏆</div>
        </div>`;
    },

    async enrichShareOptions(options) {
        const heatmapStatuses = options.heatmapStatuses || (typeof FitnessHeatmap !== 'undefined' ? FitnessHeatmap.defaultStatuses() : {});
        let bodySvgHtml = '';
        if (typeof FitnessHeatmap !== 'undefined') {
            try {
                bodySvgHtml = await FitnessHeatmap.buildBodySvgHtml(heatmapStatuses);
            } catch (e) {
                console.warn('Body map SVG unavailable', e);
            }
        }
        let animalRowHtml = '';
        if (typeof FitnessAnimalVolume !== 'undefined' && options.tonnage) {
            try {
                animalRowHtml = await FitnessAnimalVolume.buildShareRowHtml(options.tonnage);
            } catch (e) {
                console.warn('Animal volume row unavailable', e);
            }
        }
        return { ...options, heatmapStatuses, bodySvgHtml, animalRowHtml };
    },

    async captureShareCard(options) {
        if (typeof html2canvas === 'undefined') return null;
        const enriched = await this.enrichShareOptions(options);
        return this.captureHtmlCard(this.buildShareCardHtml(enriched));
    },

    async shareRecap(options) {
        const blob = await this.captureShareCard(options);

        if (blob && navigator.share) {
            const file = new File([blob], 'ba-fitness-recap.png', { type: 'image/png' });
            const filePayload = { files: [file] };
            if (!navigator.canShare || navigator.canShare(filePayload)) {
                try {
                    await navigator.share(filePayload);
                    return 'shared-image';
                } catch (err) {
                    if (err?.name === 'AbortError') return 'cancelled';
                }
            }
        }

        const enriched = await this.enrichShareOptions(options);
        return this.shareText(this.buildFallbackText(enriched));
    },

    async shareText(text) {
        if (navigator.share) {
            try {
                await navigator.share({ text });
                return 'shared';
            } catch (err) {
                if (err?.name === 'AbortError') return 'cancelled';
            }
        }

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
            window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
            return 'sms';
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return 'clipboard';
        }

        return 'failed';
    },

    contextLabel(context) {
        return ({ volume: 'Volume ranking', sessions: 'Consistency ranking', streak: 'Streak' })[context] || context;
    },

    contextEmoji(context) {
        return ({ volume: '🏋️', sessions: '📅', streak: '🔥' })[context] || '💪';
    },

    giphyApiKey() {
        return (typeof window !== 'undefined' && window.GIPHY_API_KEY || '').trim();
    },

    gifCommentUrl(gifId) {
        return `https://media.giphy.com/media/${gifId}/giphy.gif`;
    },

    parseCommentBody(body) {
        const raw = body || '';
        const gifIds = [];
        const text = raw
            .replace(/\[gif:([a-zA-Z0-9]+)\]/g, (_, id) => {
                gifIds.push(id);
                return ' ';
            })
            .replace(/\s+/g, ' ')
            .trim();
        return { text, gifIds };
    },

    encodeGifComment(gifId, text = '') {
        const id = String(gifId || '').replace(/[^a-zA-Z0-9]/g, '');
        if (!id) return (text || '').trim();
        const cleanText = (text || '').trim();
        return cleanText ? `${cleanText} [gif:${id}]` : `[gif:${id}]`;
    },

    commentHasContent(body) {
        const { text, gifIds } = this.parseCommentBody(body);
        return !!text || gifIds.length > 0;
    },

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    renderCommentHtml(body) {
        const { text, gifIds } = this.parseCommentBody(body);
        if (!text && !gifIds.length) return this.escapeHtml(body || '');

        let html = '';
        if (text) {
            html += `<span class="comment-text">${this.escapeHtml(text)}</span>`;
        }
        gifIds.forEach(id => {
            if (!/^[a-zA-Z0-9]+$/.test(id)) return;
            const url = this.gifCommentUrl(id);
            html += `<img src="${this.escapeHtml(url)}" alt="" class="comment-gif mt-1.5 max-w-[140px] max-h-[140px] rounded-xl object-cover border border-white/10" loading="lazy">`;
        });
        return html;
    },

    giphyDefaultSearch() {
        return (typeof window !== 'undefined' && window.GIPHY_DEFAULT_SEARCH || 'gym workout fitness').trim();
    },

    async searchGifs(query) {
        const key = this.giphyApiKey();
        if (!key) throw new Error('GIPHY_API_KEY missing');

        const trimmed = (query || '').trim();
        const searchQuery = trimmed || this.giphyDefaultSearch();
        const endpoint = `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(searchQuery)}&limit=24&rating=pg&lang=en`;

        const res = await fetch(endpoint);
        if (!res.ok) throw new Error('Giphy request failed');

        const json = await res.json();
        return (json.data || []).map(gif => ({
            id: gif.id,
            title: gif.title || 'GIF',
            previewUrl: gif.images?.fixed_height_small?.url
                || gif.images?.downsized_medium?.url
                || gif.images?.fixed_height?.url
                || gif.images?.original?.url
        })).filter(gif => gif.previewUrl && gif.id);
    },

    groupComments(comments) {
        const grouped = {};
        (comments || []).forEach(row => {
            if (!grouped[row.target_user_id]) grouped[row.target_user_id] = [];
            grouped[row.target_user_id].push(row);
        });
        return grouped;
    },

    buildCommentThreads(comments) {
        const map = {};
        const roots = [];
        (comments || []).forEach(row => {
            map[row.id] = { ...row, replies: [] };
        });
        (comments || []).forEach(row => {
            const node = map[row.id];
            if (row.parent_id && map[row.parent_id]) map[row.parent_id].replies.push(node);
            else roots.push(node);
        });
        return roots;
    },

    buildCommentLikeState(rows, userId) {
        const counts = {};
        const mine = new Set();
        (rows || []).forEach(row => {
            counts[row.comment_id] = (counts[row.comment_id] || 0) + 1;
            if (userId && row.actor_user_id === userId) mine.add(row.comment_id);
        });
        return { counts, mine };
    },

    likeKey(targetUserId, context) {
        return `${targetUserId}:${context}`;
    },

    formatCommentTime(iso) {
        const d = new Date(iso);
        const now = new Date();
        const diffMs = now - d;
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    },

    buildArenaFeed(likes, comments, profileMap) {
        const items = [];
        (likes || []).forEach(row => {
            const p = profileMap[row.actor_user_id] || {};
            items.push({
                id: `like-${row.id}`,
                type: 'like',
                actorUserId: row.actor_user_id,
                actorName: p.full_name || p.initials || 'Someone',
                actorInitials: p.initials || '??',
                actorAvatarUrl: p.avatar_url || null,
                context: row.context,
                body: null,
                created_at: row.created_at
            });
        });
        (comments || []).forEach(row => {
            const p = profileMap[row.author_user_id] || {};
            items.push({
                id: `comment-${row.id}`,
                type: 'comment',
                commentId: row.id,
                authorUserId: row.author_user_id,
                actorUserId: row.author_user_id,
                actorName: p.full_name || p.initials || 'Someone',
                actorInitials: p.initials || '??',
                actorAvatarUrl: p.avatar_url || null,
                context: row.context,
                body: row.body,
                created_at: row.created_at
            });
        });
        return items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
};
