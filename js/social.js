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

    bestSetLabel(set, isBodyWeight) {
        if (!set) return null;
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
        const highlights = [];

        (activeRoutine?.data || []).forEach(group => {
            (group.exercises || []).forEach(ex => {
                const doneSets = (ex.sets || []).filter(s => s.done);
                if (!doneSets.length) return;

                exerciseCount++;
                let exTonnage = 0;
                let topSet = null;
                let topVol = 0;

                doneSets.forEach(s => {
                    const w = parseFloat(s.weight) || 0;
                    const r = parseInt(s.reps, 10) || 0;
                    exTonnage += w * r;
                    setCount++;
                    const vol = w * r;
                    if (vol >= topVol) {
                        topVol = vol;
                        topSet = s;
                    }
                });

                tonnage += exTonnage;
                const label = this.bestSetLabel(topSet, ex.weightType === 'bodyweight' || ex.weightType === true);
                if (label) highlights.push(`${ex.name}: ${label}`);
            });
        });

        return {
            protocolName: activeRoutine?.name || 'Workout',
            durationSeconds: sessionTimer || 0,
            tonnage,
            setCount,
            exerciseCount,
            highlights
        };
    },

    computeFromSessionLogs(logs, sessionMeta = {}) {
        let tonnage = 0;
        let setCount = 0;
        const highlights = [];
        const exercises = new Set();

        (logs || []).forEach(log => {
            exercises.add(log.exercise_name);
            let topSet = null;
            let topVol = 0;

            (log.sets_data || []).forEach(s => {
                const w = parseFloat(s.weight) || 0;
                const r = parseInt(s.reps, 10) || 0;
                tonnage += w * r;
                setCount++;
                const vol = w * r;
                if (vol >= topVol) {
                    topVol = vol;
                    topSet = s;
                }
            });

            const label = this.bestSetLabel(topSet);
            if (label) highlights.push(`${log.exercise_name}: ${label}`);
        });

        return {
            protocolName: sessionMeta.protocol_name || logs?.[0]?.protocol_name || 'Workout',
            durationSeconds: sessionMeta.duration || logs?.[0]?.duration_seconds || 0,
            tonnage,
            setCount,
            exerciseCount: exercises.size,
            highlights
        };
    },

    buildRecap({ athleteName, protocolName, durationSeconds, tonnage, setCount, exerciseCount, highlights, streak }) {
        const who = athleteName ? athleteName.toUpperCase() : 'IRON WARRIOR';
        const proto = (protocolName || 'WORKOUT').toUpperCase();

        let msg = `╔══════════════════════════╗\n`;
        msg += `║   ⚡ BA FITNESS RECAP ⚡   ║\n`;
        msg += `╚══════════════════════════╝\n\n`;
        msg += `${who} · ${proto} · COMPLETE ✓\n\n`;
        msg += `┌──────────────────────────┐\n`;
        msg += `│ ⏱  ${this.formatDuration(durationSeconds).padEnd(8)} 🏋️  ${this.formatNumber(tonnage).padStart(7)} lbs │\n`;
        msg += `│ 📋  ${exerciseCount} exercises · ${setCount} sets${streak > 0 ? ` · 🔥 ${streak}d streak` : ''}          │\n`;
        msg += `└──────────────────────────┘`;

        if (highlights?.length) {
            msg += `\n\n🏆 TOP LIFTS\n`;
            highlights.slice(0, 5).forEach(h => {
                const [name, lift] = h.includes(':') ? h.split(': ') : [h, ''];
                const dots = '·'.repeat(Math.max(1, 18 - name.length));
                msg += `▸ ${name} ${dots} ${lift}\n`;
            });
        }

        msg += `\nMuscle heatmap attached 🔥\nThe Arena awaits 🏆`;
        return msg.trim();
    },

    buildShareCardHtml({ athleteName, protocolName, durationSeconds, tonnage, setCount, exerciseCount, highlights, streak, heatmapStatuses }) {
        const who = athleteName || 'Athlete';
        const proto = protocolName || 'Workout';
        const grid = typeof FitnessHeatmap !== 'undefined'
            ? FitnessHeatmap.buildGridHtml(heatmapStatuses || FitnessHeatmap.defaultStatuses())
            : '';
        const counts = typeof FitnessHeatmap !== 'undefined'
            ? FitnessHeatmap.countByStatus(heatmapStatuses || {})
            : {};

        const liftRows = (highlights || []).slice(0, 4).map(h => {
            const [name, lift] = h.includes(':') ? h.split(': ') : [h, ''];
            return `<div style="display:flex;justify-content:space-between;font-size:11px;color:#e2e8f0;margin-top:6px;">
                <span style="font-weight:700;text-transform:uppercase;font-style:italic;">${name}</span>
                <span style="font-weight:900;color:#3b82f6;">${lift || ''}</span>
            </div>`;
        }).join('');

        const legend = [
            { c: '#ef4444', l: 'RECOVERING', n: counts.recov || 0 },
            { c: '#a855f7', l: 'FATIGUED', n: counts.tired || 0 },
            { c: '#2dd4bf', l: 'PRIME', n: counts.prime || 0 },
            { c: '#3b82f6', l: 'COLD', n: counts.fresh || 0 }
        ].map(x => `<span style="font-size:7px;font-weight:800;color:${x.c};margin-right:8px;">● ${x.l}</span>`).join('');

        return `<div style="width:360px;background:linear-gradient(165deg,#0f172a 0%,#020617 55%,#1e1b4b 100%);border-radius:24px;padding:24px;font-family:system-ui,-apple-system,sans-serif;color:white;box-sizing:border-box;border:1px solid rgba(59,130,246,0.25);box-shadow:0 0 60px rgba(59,130,246,0.15);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <div style="font-size:9px;font-weight:900;letter-spacing:0.35em;color:#64748b;text-transform:uppercase;">BA FITNESS</div>
                ${streak > 0 ? `<div style="font-size:11px;font-weight:900;color:#f97316;">🔥 ${streak} DAY STREAK</div>` : ''}
            </div>
            <div style="font-size:22px;font-weight:900;font-style:italic;text-transform:uppercase;line-height:1.1;margin-bottom:4px;color:#ffffff;">${who}</div>
            <div style="font-size:12px;font-weight:800;color:#3b82f6;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:18px;">${proto}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:18px;">
                <div style="background:rgba(15,23,42,0.8);border-radius:14px;padding:12px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
                    <div style="font-size:18px;font-weight:900;">${this.formatDuration(durationSeconds)}</div>
                    <div style="font-size:7px;font-weight:800;color:#64748b;letter-spacing:0.1em;margin-top:4px;">DURATION</div>
                </div>
                <div style="background:rgba(15,23,42,0.8);border-radius:14px;padding:12px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
                    <div style="font-size:18px;font-weight:900;">${this.formatNumber(tonnage)}</div>
                    <div style="font-size:7px;font-weight:800;color:#64748b;letter-spacing:0.1em;margin-top:4px;">LBS MOVED</div>
                </div>
                <div style="background:rgba(15,23,42,0.8);border-radius:14px;padding:12px;border:1px solid rgba(255,255,255,0.06);text-align:center;">
                    <div style="font-size:18px;font-weight:900;">${setCount}</div>
                    <div style="font-size:7px;font-weight:800;color:#64748b;letter-spacing:0.1em;margin-top:4px;">SETS · ${exerciseCount} EX</div>
                </div>
            </div>
            ${liftRows ? `<div style="background:rgba(15,23,42,0.5);border-radius:16px;padding:14px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:8px;font-weight:900;color:#64748b;letter-spacing:0.2em;margin-bottom:4px;">TOP LIFTS</div>${liftRows}
            </div>` : ''}
            <div style="background:rgba(15,23,42,0.6);border-radius:16px;padding:14px;border:1px solid rgba(59,130,246,0.15);">
                <div style="font-size:8px;font-weight:900;color:#3b82f6;letter-spacing:0.2em;margin-bottom:8px;">MUSCLE HEATMAP</div>
                <div style="margin-bottom:10px;">${legend}</div>
                ${grid}
            </div>
            <div style="text-align:center;margin-top:16px;font-size:8px;font-weight:900;color:#475569;letter-spacing:0.25em;text-transform:uppercase;">See You In The Arena 🏆</div>
        </div>`;
    },

    async captureShareCard(options) {
        if (typeof html2canvas === 'undefined') return null;
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
        host.innerHTML = this.buildShareCardHtml(options);
        document.body.appendChild(host);
        try {
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
        const text = this.buildRecap(options);
        const blob = await this.captureShareCard(options);

        if (blob && navigator.share && navigator.canShare) {
            const file = new File([blob], 'ba-fitness-recap.png', { type: 'image/png' });
            const payload = { text, files: [file] };
            if (navigator.canShare(payload)) {
                try {
                    await navigator.share(payload);
                    return 'shared-image';
                } catch (err) {
                    if (err?.name === 'AbortError') return 'cancelled';
                }
            }
        }

        if (blob && navigator.share) {
            try {
                await navigator.share({ text: text + '\n\n(Heatmap card — screenshot from app for the full visual)' });
                return 'shared';
            } catch (err) {
                if (err?.name === 'AbortError') return 'cancelled';
            }
        }

        return this.shareText(text);
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
