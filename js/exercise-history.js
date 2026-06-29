/**
 * Per-exercise weight/rep history from workout_logs — protocol-agnostic.
 */
const FitnessExerciseHistory = {
    emptySet(prevWeight = '', prevReps = '') {
        return { weight: '', prevWeight, reps: '', prevReps, done: false, failure: false };
    },

    logFilter(client, userId, exercise) {
        let q = client
            .from('workout_logs')
            .select('sets_data, protocol_name, created_at, exercise_id, exercise_name')
            .eq('user_id', userId);
        if (exercise?.id) q = q.eq('exercise_id', exercise.id);
        else if (exercise?.name) q = q.eq('exercise_name', exercise.name);
        else return null;
        return q;
    },

    async fetchLastLog(client, userId, exercise) {
        const q = this.logFilter(client, userId, exercise);
        if (!q) return null;
        const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
        return data;
    },

    async fetchHistory(client, userId, exercise) {
        const q = this.logFilter(client, userId, exercise);
        if (!q) return [];
        const { data } = await q.order('created_at', { ascending: false });
        return data || [];
    },

    maxWeightFromHistory(history) {
        let max = 0;
        (history || []).forEach(log => {
            (log.sets_data || []).forEach(s => {
                const w = parseFloat(s.weight) || 0;
                if (w > max) max = w;
            });
        });
        return max;
    },

    setsFromLastLog(lastLog, minSets = 3) {
        let sets = [];
        if (lastLog?.sets_data?.length) {
            sets = lastLog.sets_data.map(s => this.emptySet(s.weight ?? '', s.reps ?? ''));
        }
        while (sets.length < minSets) {
            sets.push(this.emptySet());
        }
        return sets;
    },

    applyPrevFromLog(exercise, lastLog) {
        if (!lastLog?.sets_data?.length) return;
        lastLog.sets_data.forEach((histSet, i) => {
            if (!exercise.sets[i]) {
                exercise.sets.push(this.emptySet(histSet.weight ?? '', histSet.reps ?? ''));
            } else if (!exercise.sets[i].done) {
                exercise.sets[i].prevWeight = histSet.weight ?? exercise.sets[i].prevWeight;
                exercise.sets[i].prevReps = histSet.reps ?? exercise.sets[i].prevReps;
            }
        });
    },

    collectExercises(routine) {
        const list = [];
        (routine?.data || []).forEach(group => {
            (group.exercises || []).forEach(ex => {
                if (ex?.id || ex?.name) list.push(ex);
            });
        });
        return list;
    },

    /** Refresh prevWeight/prevReps from latest logs — any protocol, including freeflow. */
    async hydrateRoutine(client, userId, routine) {
        const exercises = this.collectExercises(routine);
        if (!exercises.length) return;
        await Promise.all(exercises.map(async ex => {
            const lastLog = await this.fetchLastLog(client, userId, ex);
            if (!lastLog) return;
            (routine.data || []).forEach(group => {
                (group.exercises || []).forEach(target => {
                    const sameId = ex.id && target.id && ex.id === target.id;
                    const sameName = ex.name && target.name && ex.name === target.name;
                    if (sameId || sameName) this.applyPrevFromLog(target, lastLog);
                });
            });
        }));
    },

    async initExerciseSets(client, userId, exercise, minSets = 3) {
        const history = await this.fetchHistory(client, userId, exercise);
        exercise.personalRecord = this.maxWeightFromHistory(history);
        exercise.sets = this.setsFromLastLog(history[0] || null, minSets);
        return exercise;
    }
};
