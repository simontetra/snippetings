# Snippetings

Little bits of overheard life, from buses, queues and waiting rooms. Funny, human, never unkind. Always anonymous.

- `index.html`, `style.css`, `app.js`: the site (installable as a phone app)
- `config.js`: Supabase project URL and publishable key
- `supabase/schema.sql`: database, kindness rules, rate limits, reports

Hosted as a Render static site (publish path `./`, no build command).
To moderate: in Supabase, Table editor → `snippets`, set `status` to `hidden`.
To check snippets before they appear: set `settings.require_approval` to true, then set `status` to `live` to approve.
