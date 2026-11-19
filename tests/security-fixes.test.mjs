import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadConfig() {
    const store = new Map();
    const memory = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    };
    const session = new Map();
    const sessionStore = {
        getItem: (k) => (session.has(k) ? session.get(k) : null),
        setItem: (k, v) => session.set(k, String(v)),
        removeItem: (k) => session.delete(k)
    };
    const context = {
        window: {},
        localStorage: memory,
        sessionStorage: sessionStore,
        console,
        navigator: { onLine: true }
    };
    context.window = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(readFileSync(new URL('../js/config.js', import.meta.url), 'utf8'), context);
    context.__store = store;
    return context;
}

test('legacy active session is still readable after the rename', () => {
    const ctx = loadConfig();
    ctx.localStorage.setItem('constellation_active_session', '{"activeRoutine":{"name":"Push"}}');
    const raw = ctx.FitnessStorage.read('ba_fitness_active_session', 'constellation_active_session');
    assert.equal(JSON.parse(raw).activeRoutine.name, 'Push');
    assert.equal(ctx.localStorage.getItem('ba_fitness_active_session'), raw);
});

test('writing the new key drops the legacy key', () => {
    const ctx = loadConfig();
    ctx.localStorage.setItem('constellation_user_prefs', '{"pages":{}}');
    ctx.FitnessStorage.write('ba_fitness_user_prefs', 'constellation_user_prefs', '{"pages":{"gym":false}}');
    assert.equal(ctx.localStorage.getItem('constellation_user_prefs'), null);
    assert.match(ctx.localStorage.getItem('ba_fitness_user_prefs'), /gym/);
});

test('a failed finish stays queued and is not treated as saved', () => {
    const ctx = loadConfig();
    ctx.FitnessWorkoutSync.enqueueFinish({
        sessionId: 'sess-1',
        logs: [{ exercise_name: 'Squat', session_id: 'sess-1' }],
        userId: 'user-1',
        queuedAt: 1000
    });
    assert.equal(ctx.FitnessWorkoutSync.loadQueue().length, 1);
    ctx.localStorage.setItem('ba_fitness_active_session', JSON.stringify({
        pendingFinishSessionId: 'sess-1',
        updatedAt: 1000
    }));
    assert.equal(ctx.FitnessWorkoutSync.editedAfterQueue(ctx.FitnessWorkoutSync.loadQueue()[0]), false);
});

test('edits after a failed finish block the automatic retry', () => {
    const ctx = loadConfig();
    const item = { sessionId: 'sess-1', queuedAt: 1000, logs: [{ a: 1 }] };
    ctx.localStorage.setItem('ba_fitness_active_session', JSON.stringify({
        pendingFinishSessionId: 'sess-1',
        updatedAt: 5000
    }));
    assert.equal(ctx.FitnessWorkoutSync.editedAfterQueue(item), true);
});

test('auth errors are plain language', () => {
    const ctx = loadConfig();
    assert.equal(ctx.FitnessAuth.friendlyError('missing email or phone'), 'Enter your email and a password.');
    assert.equal(ctx.FitnessAuth.friendlyError('Invalid login credentials'), 'That email and password don’t match.');
    assert.match(ctx.FitnessAuth.friendlyError('something unexpected from the server'), /try again/i);
});

test('flush keeps the workout when the insert fails', async () => {
    const ctx = loadConfig();
    ctx.FitnessWorkoutSync.enqueueFinish({
        sessionId: 'sess-2',
        logs: [{ exercise_name: 'Bench', session_id: 'sess-2' }],
        queuedAt: 10
    });
    const client = {
        from() {
            return {
                select: () => ({
                    eq: () => ({
                        limit: async () => ({ data: [], error: null })
                    })
                }),
                insert: async () => ({ error: { message: 'Failed to fetch' } })
            };
        }
    };
    const result = await ctx.FitnessWorkoutSync.flush(client);
    assert.equal(result.saved, 0);
    assert.equal(result.pending, 1);
    assert.equal(ctx.FitnessWorkoutSync.loadQueue()[0].sessionId, 'sess-2');
});

test('flush does not insert twice when the session is already saved', async () => {
    const ctx = loadConfig();
    ctx.FitnessWorkoutSync.enqueueFinish({
        sessionId: 'sess-3',
        logs: [{ exercise_name: 'Row', session_id: 'sess-3' }],
        queuedAt: 10,
        userId: 'u'
    });
    let inserts = 0;
    const client = {
        from(table) {
            return {
                select: () => ({
                    eq: () => ({
                        limit: async () => ({ data: [{ id: 'existing' }], error: null })
                    })
                }),
                insert: async () => {
                    inserts += 1;
                    return { error: null };
                },
                update: () => ({ eq: async () => ({ error: null }) })
            };
        }
    };
    const result = await ctx.FitnessWorkoutSync.flush(client);
    assert.equal(inserts, 0);
    assert.equal(result.saved, 1);
    assert.equal(result.pending, 0);
});
