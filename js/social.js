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
        const reps = parseInt(set.reps, 10) || 0;
        if (!reps) return null;
        const weight = parseFloat(set.weight);
        const wLabel = isNaN(weight) || weight === 0 ? 'BW' : weight;
        return `${wLabel}×${reps}`;
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
                    const label = this.setLabel(s, ex.weightType === 'bodyweight' || ex.weightType === true);
                    if (label) sets.push(label);
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
                const label = this.setLabel(s);
                if (label) sets.push(label);
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
                msg += `${line.name}: ${line.sets.join(', ')}\n`;
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

    buildStreakShareCardHtml({ athleteName, streakDays }) {
        const who = athleteName || 'Athlete';
        const days = parseInt(streakDays, 10) || 0;
        return `<div style="width:380px;background:linear-gradient(165deg,#1c1917 0%,#020617 45%,#431407 100%);border-radius:28px;padding:12px 22px 22px;font-family:system-ui,-apple-system,sans-serif;color:white;box-sizing:border-box;border:1px solid rgba(249,115,22,0.45);overflow:hidden;line-height:1.15;"><div style="font-size:8px;font-weight:900;letter-spacing:0.4em;color:#64748b;text-transform:uppercase;line-height:1;margin:0 0 3px;">BA FITNESS · THE ARENA</div><div style="font-size:24px;font-weight:900;font-style:italic;text-transform:uppercase;line-height:1.05;color:#ffffff;margin:0 0 2px;">${who}</div><div style="font-size:11px;font-weight:800;color:#f97316;text-transform:uppercase;letter-spacing:0.14em;line-height:1;margin:0 0 14px;">Streak Champion</div>

            <div style="background:rgba(15,23,42,0.65);border-radius:22px;padding:28px 20px;border:1px solid rgba(249,115,22,0.25);text-align:center;margin-bottom:20px;">
                <div style="font-size:48px;line-height:1;margin-bottom:12px;">🔥</div>
                <div style="font-size:56px;font-weight:900;font-style:italic;line-height:1;color:#f97316;text-shadow:0 0 30px rgba(249,115,22,0.45);">${days}</div>
                <div style="font-size:10px;font-weight:900;color:#fdba74;letter-spacing:0.28em;margin-top:8px;">DAY STREAK</div>
            </div>

            <div style="background:rgba(249,115,22,0.08);border-radius:16px;padding:14px 16px;border:1px solid rgba(249,115,22,0.2);text-align:center;margin-bottom:8px;">
                <div style="font-size:11px;font-weight:900;color:#fed7aa;letter-spacing:0.18em;text-transform:uppercase;font-style:italic;">Consistency is King</div>
            </div>

            <div style="text-align:center;margin-top:18px;font-size:9px;font-weight:900;color:#94a3b8;letter-spacing:0.28em;text-transform:uppercase;">The Arena Awaits 🏆</div>
        </div>`;
    },

    buildRankingShareCardHtml({ athleteName, rank, metric, score, unit, metricLabel }) {
        const who = athleteName || 'Athlete';
        const theme = this.rankTheme(rank);
        const meta = this.metricShareMeta(metric);
        const rankText = this.rankLabel(rank).toUpperCase();
        const placeLine = rank <= 2 ? `${rankText} PLACE` : `${rankText} IN THE ARENA`;

        return `<div style="width:380px;background:linear-gradient(165deg,#0f172a 0%,#020617 50%,#1e1b4b 100%);border-radius:28px;padding:12px 22px 22px;font-family:system-ui,-apple-system,sans-serif;color:white;box-sizing:border-box;border:1px solid ${theme.border};overflow:hidden;line-height:1.15;"><div style="font-size:8px;font-weight:900;letter-spacing:0.4em;color:#64748b;text-transform:uppercase;line-height:1;margin:0 0 3px;">BA FITNESS · THE ARENA</div><div style="font-size:24px;font-weight:900;font-style:italic;text-transform:uppercase;line-height:1.05;color:#ffffff;margin:0 0 2px;">${who}</div><div style="font-size:11px;font-weight:800;color:${meta.color};text-transform:uppercase;letter-spacing:0.12em;line-height:1;margin:0 0 14px;">${meta.title}</div>

            <div style="background:rgba(15,23,42,0.75);border-radius:22px;padding:20px 20px 18px;border:1px solid rgba(255,255,255,0.08);text-align:center;margin-bottom:18px;">
                <div style="font-size:13px;font-weight:900;color:${theme.accent};letter-spacing:0.22em;line-height:1;margin-bottom:10px;">${placeLine}</div>
                <div style="height:56px;display:flex;align-items:center;justify-content:center;margin-bottom:8px;">
                    <div style="font-size:48px;font-weight:900;font-style:italic;line-height:1;color:#ffffff;">${score}</div>
                </div>
                <div style="font-size:9px;font-weight:800;color:#64748b;letter-spacing:0.2em;line-height:1.3;">${meta.statCaption}</div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;">
                <div style="background:rgba(15,23,42,0.85);border-radius:14px;padding:12px 10px;border:1px solid rgba(255,255,255,0.07);text-align:center;">
                    <div style="font-size:8px;font-weight:800;color:#64748b;letter-spacing:0.12em;margin-bottom:4px;">METRIC</div>
                    <div style="font-size:11px;font-weight:900;color:${meta.color};text-transform:uppercase;">${metricLabel || meta.title}</div>
                </div>
                <div style="background:rgba(15,23,42,0.85);border-radius:14px;padding:12px 10px;border:1px solid rgba(255,255,255,0.07);text-align:center;">
                    <div style="font-size:8px;font-weight:800;color:#64748b;letter-spacing:0.12em;margin-bottom:4px;">WINDOW</div>
                    <div style="font-size:11px;font-weight:900;color:#e2e8f0;text-transform:uppercase;">Last 7 Days</div>
                </div>
            </div>

            <div style="text-align:center;margin-top:18px;font-size:9px;font-weight:900;color:#94a3b8;letter-spacing:0.28em;text-transform:uppercase;">The Arena Awaits 🏆</div>
        </div>`;
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
        host.style.cssText = 'position:fixed;left:0;top:0;transform:translateX(-10000px);z-index:-1;line-height:0;font-size:0;';
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

    buildShareCardHtml({ athleteName, protocolName, durationSeconds, tonnage, setCount, exerciseCount, liftLines, streak, bodySvgHtml, heatmapStatuses }) {
        const who = athleteName || 'Athlete';
        const proto = protocolName || 'Workout';
        const legend = typeof FitnessHeatmap !== 'undefined'
            ? FitnessHeatmap.legendHtml(heatmapStatuses || {})
            : '';

        const liftRows = (liftLines || []).map(line => `
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:10px;font-weight:800;color:#e2e8f0;text-transform:uppercase;font-style:italic;margin-bottom:3px;">${line.name}</div>
                <div style="font-size:11px;font-weight:900;color:#3b82f6;letter-spacing:0.04em;">${line.sets.join('  ·  ')}</div>
            </div>`).join('');

        return `<div style="width:380px;background:linear-gradient(165deg,#0f172a 0%,#020617 50%,#1e1b4b 100%);border-radius:28px;padding:12px 22px 22px;font-family:system-ui,-apple-system,sans-serif;color:white;box-sizing:border-box;border:1px solid rgba(59,130,246,0.3);overflow:hidden;line-height:1.15;"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;"><div><div style="font-size:8px;font-weight:900;letter-spacing:0.4em;color:#64748b;text-transform:uppercase;line-height:1;margin:0 0 3px;">BA FITNESS</div><div style="font-size:24px;font-weight:900;font-style:italic;text-transform:uppercase;line-height:1.05;color:#ffffff;margin:0;">${who}</div><div style="font-size:11px;font-weight:800;color:#3b82f6;text-transform:uppercase;letter-spacing:0.12em;line-height:1;margin:2px 0 0;">${proto}</div></div>
                ${streak > 0 ? `<div style="background:rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.35);border-radius:12px;padding:8px 10px;text-align:center;">
                    <div style="font-size:16px;line-height:1;">🔥</div>
                    <div style="font-size:10px;font-weight:900;color:#f97316;margin-top:2px;">${streak} DAY</div>
                </div>` : ''}
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;">
                <div style="background:rgba(15,23,42,0.85);border-radius:14px;padding:12px 8px;border:1px solid rgba(255,255,255,0.07);text-align:center;">
                    <div style="font-size:17px;font-weight:900;">${this.formatDuration(durationSeconds)}</div>
                    <div style="font-size:6px;font-weight:800;color:#64748b;letter-spacing:0.12em;margin-top:4px;">DURATION</div>
                </div>
                <div style="background:rgba(15,23,42,0.85);border-radius:14px;padding:12px 8px;border:1px solid rgba(255,255,255,0.07);text-align:center;">
                    <div style="font-size:17px;font-weight:900;">${this.formatNumber(tonnage)}</div>
                    <div style="font-size:6px;font-weight:800;color:#64748b;letter-spacing:0.12em;margin-top:4px;">LBS MOVED</div>
                </div>
                <div style="background:rgba(15,23,42,0.85);border-radius:14px;padding:12px 8px;border:1px solid rgba(255,255,255,0.07);text-align:center;">
                    <div style="font-size:17px;font-weight:900;">${setCount}</div>
                    <div style="font-size:6px;font-weight:800;color:#64748b;letter-spacing:0.12em;margin-top:4px;">SETS · ${exerciseCount} EX</div>
                </div>
            </div>

            ${liftRows ? `<div style="background:rgba(15,23,42,0.55);border-radius:18px;padding:16px;margin-bottom:18px;border:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:8px;font-weight:900;color:#64748b;letter-spacing:0.22em;margin-bottom:2px;">THE WORK</div>
                ${liftRows}
            </div>` : ''}

            <div style="background:rgba(15,23,42,0.65);border-radius:18px;padding:16px;border:1px solid rgba(59,130,246,0.2);">
                <div style="font-size:8px;font-weight:900;color:#3b82f6;letter-spacing:0.22em;margin-bottom:10px;">SYSTEM STATUS</div>
                <div style="margin-bottom:10px;text-align:center;">${legend}</div>
                <div style="width:100%;text-align:center;line-height:0;padding:10px 0 8px;overflow:visible;">${bodySvgHtml || ''}</div>
            </div>

            <div style="text-align:center;margin-top:20px;font-size:9px;font-weight:900;color:#94a3b8;letter-spacing:0.28em;text-transform:uppercase;">The Arena Awaits 🏆</div>
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
        return { ...options, heatmapStatuses, bodySvgHtml };
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

    groupComments(comments) {
        const grouped = {};
        (comments || []).forEach(row => {
            if (!grouped[row.target_user_id]) grouped[row.target_user_id] = [];
            grouped[row.target_user_id].push(row);
        });
        return grouped;
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
                actorName: p.full_name || p.initials || 'Someone',
                actorInitials: p.initials || '??',
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
                actorName: p.full_name || p.initials || 'Someone',
                actorInitials: p.initials || '??',
                context: row.context,
                body: row.body,
                created_at: row.created_at
            });
        });
        return items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
};
