/**
 * Standard vs personal protocol (routine) helpers.
 * Standard protocols (owner UUID) are visible to everyone; personal ones are private.
 */
const FitnessRoutineLibrary = {
    standardOwnerId() {
        return window.FITNESS_STANDARD_LIBRARY_OWNER_ID || null;
    },

    isStandard(routine) {
        return !!routine && routine.user_id === this.standardOwnerId();
    },

    canEdit(routine, userId) {
        return !!routine && !!userId && routine.user_id === userId;
    },

    async fetch(client) {
        const { data, error } = await client
            .from('routines')
            .select('*, profiles(initials)')
            .order('created_at');
        if (error) throw error;
        return data || [];
    },

    sortForDisplay(routines, userId) {
        const list = [...(routines || [])];
        if (!userId) return list;
        return list.sort((a, b) => {
            const mineA = a.user_id === userId;
            const mineB = b.user_id === userId;
            if (mineA && !mineB) return -1;
            if (!mineA && mineB) return 1;
            const stdA = this.isStandard(a);
            const stdB = this.isStandard(b);
            if (stdA && !stdB) return -1;
            if (!stdA && stdB) return 1;
            return 0;
        });
    },

    authorLabel(routine, userId) {
        if (this.canEdit(routine, userId)) return 'ME';
        if (this.isStandard(routine)) return routine.profiles?.initials || 'BA';
        return routine.profiles?.initials || '??';
    }
};
