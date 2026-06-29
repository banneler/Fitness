# BA Fitness

Progressive overload PWA — Vue 3 + Supabase.

## Social features

### Share workout
- **Finish modal** (`workout.html`) — "Share with Buddies" opens native share with a styled recap card **image** (includes muscle heatmap grid) plus a formatted text message. Falls back to SMS or clipboard.
- **Tracker → Motion → Performance Ledger** — same share flow for past sessions.
- **Today → Iron Volume card** — share icon appears when you've logged volume today; shares your most recent session from today with the heatmap recap card.

Share uses `html2canvas` to render a single recap **image** (stats, all lifts, real body heatmap SVG). No separate text message — image only, with plain-text fallback if sharing fails.

### Arena cheers & comments
Likes and comments on leaderboard rows (Volume, Consistency, Streak tabs). Comments support text plus GIFs via an in-app Giphy picker.

**Giphy setup:** get a free API key at [developers.giphy.com](https://developers.giphy.com/dashboard/) and paste it into `js/giphy-config.js` as `window.GIPHY_API_KEY`. Optional: change `window.GIPHY_DEFAULT_SEARCH` (default `gym workout fitness`) for the GIFs shown when the picker first opens — search still queries all of Giphy. Restrict the API key to your app domain in the Giphy dashboard when you deploy.

**One-time setup:** run `supabase/social_schema.sql` in the Supabase SQL Editor to create `arena_likes` and `arena_comments` with RLS policies.

Without those tables, sharing still works; cheers/comments show a setup reminder on the leaderboard.

### Arena Cheers on Today
The **Today** page shows recent likes and comments from the last 7 days when buddies interact with your leaderboard row (volume, consistency, or streak).
