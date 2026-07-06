/**
 * Shared bottom tab bar — respects FitnessUserPrefs page visibility.
 */
window.FitnessBottomNav = {
    TABS: [
        { id: 'today', href: 'today.html', label: 'Today', icon: 'calendar', pref: null, activeClass: 'tab-active text-white' },
        { id: 'gym', href: 'gym.html', label: 'Gym', icon: 'dumbbell', pref: 'gym', activeClass: 'tab-active text-blue-500' },
        { id: 'arena', href: 'leaderboard.html', label: 'Arena', icon: 'trophy', pref: 'arena', activeClass: 'tab-active text-purple-500' },
        { id: 'kitchen', href: 'kitchen.html', label: 'Kitchen', icon: 'utensils', pref: 'kitchen', activeClass: 'tab-active text-green-500' },
        { id: 'tracker', href: 'tracker.html', label: 'Tracker', icon: 'line-chart', pref: 'tracker', activeClass: 'tab-active text-blue-500' }
    ],

    visibleTabs(prefs) {
        return this.TABS.filter(tab => !tab.pref || FitnessUserPrefs.isPageEnabled(prefs, tab.pref));
    },

    render(activeId, prefs) {
        const tabs = this.visibleTabs(prefs || FitnessUserPrefs.load());
        return tabs.map(tab => {
            const active = tab.id === activeId;
            const href = active ? '#' : tab.href;
            const cls = active
                ? `flex flex-col items-center ${tab.activeClass}`
                : 'flex flex-col items-center text-slate-600 hover:text-white transition-all';
            return `<a href="${href}" class="${cls}"><i data-lucide="${tab.icon}" class="w-6 h-6 mb-1"></i><span class="text-[8px] font-black uppercase italic tracking-widest">${tab.label}</span></a>`;
        }).join('');
    },

    mount(containerId, activeId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        const prefs = FitnessUserPrefs.load();
        const tabs = this.visibleTabs(prefs);
        el.className = `fixed bottom-0 left-0 right-0 glass border-t border-white/5 flex ${tabs.length <= 3 ? 'justify-around' : 'justify-between'} px-6 py-4 safe-area-bottom z-[100]`;
        el.innerHTML = this.render(activeId, prefs);
        if (typeof lucide !== 'undefined') {
            try { lucide.createIcons(); } catch (e) { console.warn(e); }
        }
    }
};
