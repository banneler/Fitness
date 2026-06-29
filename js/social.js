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
        let msg = '💪 BA FITNESS RECAP 💪\n\n';
        if (athleteName) msg += `${athleteName} just crushed "${protocolName}"!\n\n`;
        else msg += `Just crushed "${protocolName}"!\n\n`;

        msg += `⏱ ${this.formatDuration(durationSeconds)}  •  🏋️ ${this.formatNumber(tonnage)} lbs moved\n`;
        msg += `📋 ${exerciseCount} exercises  •  ${setCount} sets logged`;

        if (streak > 0) msg += `\n🔥 ${streak}-day streak rolling!`;

        if (highlights?.length) {
            msg += '\n\nTOP LIFTS:\n';
            highlights.slice(0, 6).forEach(h => { msg += `• ${h}\n`; });
        }

        msg += '\nSee you in The Arena 🏆';
        return msg.trim();
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

    groupLikes(likes) {
        const counts = {};
        const mine = new Set();
        likes.forEach(row => {
            const key = row.target_user_id;
            counts[key] = (counts[key] || 0) + 1;
        });
        return { counts, mine };
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
    }
};
