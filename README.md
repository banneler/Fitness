# BA Fitness

Progressive overload PWA — Vue 3 + Supabase.

## Social features

### Share workout
- **Finish modal** (`workout.html`) — "Share with Buddies" opens the native share sheet or SMS with a formatted recap.
- **Tracker → Motion → Performance Ledger** — share any past session the same way.

### Arena cheers & comments
Likes and comments on leaderboard rows (Volume, Consistency, Streak tabs).

**One-time setup:** run `supabase/social_schema.sql` in the Supabase SQL Editor to create `arena_likes` and `arena_comments` with RLS policies.

Without those tables, sharing still works; cheers/comments show a setup reminder on the leaderboard.
