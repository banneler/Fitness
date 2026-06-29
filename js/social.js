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

        return `<div style="width:380px;background:linear-gradient(165deg,#0f172a 0%,#020617 50%,#1e1b4b 100%);border-radius:28px;padding:28px 24px;font-family:system-ui,-apple-system,sans-serif;color:white;box-sizing:border-box;border:1px solid rgba(59,130,246,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
                <div>
                    <div style="font-size:8px;font-weight:900;letter-spacing:0.4em;color:#64748b;text-transform:uppercase;margin-bottom:6px;">BA FITNESS</div>
                    <div style="font-size:24px;font-weight:900;font-style:italic;text-transform:uppercase;line-height:1.05;color:#ffffff;">${who}</div>
                    <div style="font-size:11px;font-weight:800;color:#3b82f6;text-transform:uppercase;letter-spacing:0.12em;margin-top:4px;">${proto}</div>
                </div>
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
                <div style="width:100%;text-align:center;line-height:0;padding:4px 0 8px;">${bodySvgHtml || ''}</div>
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
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
        host.innerHTML = this.buildShareCardHtml(enriched);
        document.body.appendChild(host);
        try {
            await new Promise(r => setTimeout(r, 150));
            const canvas = await html2canvas(host.firstElementChild, {
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
