# BA Fitness

Progressive overload PWA — Vue 3 + Supabase.

## Social features

### Share workout
- **Finish modal** (`workout.html`) — "Share with Buddies" opens native share with a styled recap card **image** (includes muscle heatmap grid) plus a formatted text message. Falls back to SMS or clipboard.
- **Tracker → Motion → Performance Ledger** — same share flow for past sessions.

Share uses `html2canvas` to render the heatmap card; on iOS/Android, Messages receives both the image and text when the device supports `navigator.share({ files })`.

### Arena cheers & comments
Likes and comments on leaderboard rows (Volume, Consistency, Streak tabs).

**One-time setup:** run `supabase/social_schema.sql` in the Supabase SQL Editor to create `arena_likes` and `arena_comments` with RLS policies.

Without those tables, sharing still works; cheers/comments show a setup reminder on the leaderboard.

### Arena Cheers on Today
The **Today** page shows recent likes and comments from the last 7 days when buddies interact with your leaderboard row (volume, consistency, or streak).
