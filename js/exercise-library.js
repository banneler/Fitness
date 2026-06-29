/**
 * Standard vs personal exercise library helpers.
 * Standard exercises (owner UUID) are visible to everyone; personal ones are private.
 */
const FitnessExerciseLibrary = {
    standardOwnerId() {
        return window.FITNESS_STANDARD_LIBRARY_OWNER_ID || null;
    },

    isStandard(exercise) {
        return !!exercise && exercise.user_id === this.standardOwnerId();
    },

    canEdit(exercise, userId) {
        return !!exercise && !!userId && exercise.user_id === userId;
    },

    async fetch(client) {
        const { data, error } = await client.from('exercises').select('*').order('name');
        if (error) throw error;
        return data || [];
    },

    findById(library, id) {
        return (library || []).find(e => e.id === id) || null;
    },

    findForLog(library, log) {
        if (!log) return null;
        if (log.exercise_id) {
            const byId = this.findById(library, log.exercise_id);
            if (byId) return byId;
        }
        if (!log.exercise_name) return null;
        const norm = log.exercise_name.trim().toLowerCase();
        return (library || []).find(e => e.name.trim().toLowerCase() === norm) || null;
    },

    logPayload(userId, exercise, extra = {}) {
        return {
            user_id: userId,
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            ...extra
        };
    }
};
