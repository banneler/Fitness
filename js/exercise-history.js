/**
 * Per-exercise weight/rep history from workout_logs — protocol-agnostic.
 */
const FitnessExerciseHistory = {
    emptySet(prevWeight = '', prevReps = '') {
        return { weight: '', prevWeight, reps: '', prevReps, done: false, failure: false };
    },

    async fetchLastLog(client, userId, exerciseName) {
        const { data } = await client
            .from('workout_logs')
            .select('sets_data, protocol_name, created_at')
            .eq('user_id', userId)
            .eq('exercise_name', exerciseName)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        return data;
    },

    async fetchHistory(client, userId, exerciseName) {
        const { data } = await client
            .from('workout_logs')
            .select('sets_data')
            .eq('user_id', userId)
            .eq('exercise_name', exerciseName)
            .order('created_at', { ascending: false });
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

    collectExerciseNames(routine) {
        const names = new Set();
        (routine?.data || []).forEach(group => {
            (group.exercises || []).forEach(ex => { if (ex.name) names.add(ex.name); });
        });
        return names;
    },

    /** Refresh prevWeight/prevReps from latest logs — any protocol, including freeflow. */
    async hydrateRoutine(client, userId, routine) {
        const names = this.collectExerciseNames(routine);
        if (!names.size) return;
        await Promise.all([...names].map(async name => {
            const lastLog = await this.fetchLastLog(client, userId, name);
            if (!lastLog) return;
            (routine.data || []).forEach(group => {
                (group.exercises || []).forEach(ex => {
                    if (ex.name === name) this.applyPrevFromLog(ex, lastLog);
                });
            });
        }));
    },

    async initExerciseSets(client, userId, exercise, minSets = 3) {
        const history = await this.fetchHistory(client, userId, exercise.name);
        exercise.personalRecord = this.maxWeightFromHistory(history);
        exercise.sets = this.setsFromLastLog(history[0] || null, minSets);
        return exercise;
    }
};
