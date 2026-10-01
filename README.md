# Black Belt Study

A GitHub Pages frontend + Supabase backend for a personal Taekwondo Black Belt study site.

## What is included

- Public official syllabus browsing without login.
- Official decks/categories/cards that are protected from normal-user edits by Supabase RLS.
- Optional user accounts for personal decks only.
- Personal decks/cards owned by each user.
- Flashcard review with local known/missed tracking.
- Progress dashboard.
- Separate hidden admin page entry point for managing official content.
- Supabase Edge Function starter for AI summaries. The OpenAI key lives server-side in Supabase, never in GitHub Pages.

## 1. Create the Supabase database

Run `schema.sql` in the Supabase SQL editor.

Create one normal Supabase Auth account for yourself. Then add that user's UUID to `admin_users`:

```sql
insert into public.admin_users (user_id) values ('YOUR_AUTH_USER_UUID');
```

The starter schema inserts a few example official decks, categories and Korean terms. Replace/add them with your actual grading syllabus.

## 2. Configure GitHub Pages

Edit `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY'
};
```

Use the public anon/publishable key only. Never use the Supabase service-role key in this repo.

Push the folder contents to a GitHub repository and enable GitHub Pages from the branch/folder containing `index.html`.

## 3. Admin content manager

Create `admin.html` as the admin-only CRUD UI using the same Supabase Auth account. The main site does not show a login unless the visitor tries to create a personal deck.

## 4. AI summaries (optional)

Deploy the Edge Function:

```bash
supabase functions deploy ai-summarise
```

Set the secret:

```bash
supabase secrets set OPENAI_API_KEY=YOUR_KEY
```

The frontend can then call `ai-summarise` to transform your official theory into quick revision notes. Keep the official syllabus itself in Supabase; AI should only summarise supplied content, not define the syllabus.

## Suggested next step

Build `admin.html` so you can create/reorder official decks, categories and cards directly from the browser. This keeps the public study app separate from the content manager while retaining the same Supabase database and admin permissions.
