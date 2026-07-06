# BA Fitness

Progressive overload PWA — Vue 3 + Supabase.

## Social features

### Share workout
- **Finish modal** (`workout.html`) — "Share with Buddies" opens native share with a styled recap card **image** (includes muscle heatmap grid) plus a formatted text message. Falls back to SMS or clipboard.
- **Tracker → Motion → Performance Ledger** — same share flow for past sessions.
- **Today → Iron Volume card** — share icon appears when you've logged volume today; shares your most recent session from today with the heatmap recap card.

Share uses `html2canvas` to render a single recap **image** (stats, all lifts, real body heatmap SVG). No separate text message — image only, with plain-text fallback if sharing fails.

### Exercise library (standard + personal)
Exercises owned by **Bryan Anneler** (`6f471a6f-3697-4826-a0d8-34404ea5980d`) are the global **standard** library — visible to everyone. Any other user’s custom exercises are **personal** and only visible to them.

**One-time setup:** run `supabase/exercises_schema.sql` in the Supabase SQL Editor. This adds RLS policies, links `workout_logs.exercise_id`, dedupes standard exercises, and enforces one canonical name per standard lift.

The owner UUID is also set in `js/config.js` (must match the SQL function `fitness_standard_owner_id()`).

### Protocol library (standard + personal)
Protocols (routines) owned by **Bryan Anneler** are the global **standard** set — visible to everyone. Any other user’s custom protocols are **personal** and only visible to them.

**One-time setup:** run `supabase/routines_schema.sql` in the Supabase SQL Editor. This adds RLS policies, dedupes standard protocols, and enforces one canonical name per standard protocol.

### Arena cheers & comments
Likes and comments on leaderboard rows (Volume, Consistency, Streak tabs). Comments support text plus GIFs via an in-app Giphy picker.

**Giphy setup:** get a free API key at [developers.giphy.com](https://developers.giphy.com/dashboard/) and paste it into `js/giphy-config.js` as `window.GIPHY_API_KEY`. Optional: change `window.GIPHY_DEFAULT_SEARCH` (default `gym workout fitness`) for the GIFs shown when the picker first opens — search still queries all of Giphy. Restrict the API key to your app domain in the Giphy dashboard when you deploy.

**One-time setup:** run `supabase/social_schema.sql` in the Supabase SQL Editor to create `arena_likes` and `arena_comments` with RLS policies.

Without those tables, sharing still works; cheers/comments show a setup reminder on the leaderboard.

Comment **likes** and **replies** require the `parent_id` column and `arena_comment_likes` table from `supabase/arena_prs_schema.sql` (run that migration after `social_schema.sql`).

### Weekly PR board
Community tally of personal records hit this week — confetti on open, likes, comments, and replies on each PR card (`prs.html`). Linked from the Arena leaderboard header.

**One-time setup:** run `supabase/arena_prs_schema.sql` in the Supabase SQL Editor (after `social_schema.sql`). Creates `arena_pr_events`, PR likes/comments, and comment-like tables. Without it, the PR page falls back to computing PRs from `workout_logs` for the current week (no social on PR cards).

PRs are recorded automatically when you finish a workout session.

### Arena Cheers on Today
The **Today** page shows recent likes and comments from the last 7 days when buddies interact with your leaderboard row (volume, consistency, or streak).
