# Nexus Clinical Pharmacist — v4 Clinical Brain MVP

This version keeps the v3 UI and upgrades the backend into a small clinical reasoning pipeline.

## What changed in v4

The frontend still sends messages to `/api/chat`, but the API no longer forwards the user question directly to the AI. It now runs:

```txt
User Question
  ↓
[0] Fast Local Detector
  ↓
[1] Question Parser AI JSON + local fallback
  ↓
[2] Entity Normalizer
  ↓
[3] Parser Confidence / Missing Info Check
  ↓
[4] Local Data Search
  ↓
[5] Interaction Engine
  ↓
[6] Risk Triage
  ↓
[7] Conflict Resolver
  ↓
[8] AI Answer Composer
  ↓
[9] Safety / Validation Guardrails
  ↓
[10] Final Answer + Local Sources
```

This is intentionally an MVP with a small local drug dataset so you can test the architecture before moving the medical data to Supabase.

---

## Files

```txt
index.html
style.css
script.js
api/chat.js
vercel.json
README.md
data/drug_aliases.json
data/drug_monographs.json
data/interactions.json
data/clinical_rules.json
data/risk_keywords.json
```

---

## Data included for testing

The local MVP data includes aliases, monographs, interaction rules, and safety rules for examples such as:

- ramipril
- potassium chloride
- diclofenac
- furosemide
- warfarin
- amiodarone
- metformin
- insulin
- alfuzosin
- sildenafil
- losartan
- aspirin

Good tests:

```txt
مريض 60 سنة بياخد ramipril و potassium supplement، مفيش K ولا creatinine حديث. ينفع؟
```

```txt
Check interaction: warfarin with amiodarone. Include mechanism and monitoring.
```

```txt
Patient takes ramipril + diclofenac + furosemide. What is the risk?
```

```txt
Start Drug Reverse training for alfuzosin + sildenafil interaction.
```

---

## Vercel environment variables

Set these in Vercel Project Settings → Environment Variables:

```env
NVIDIA_API_KEY=your_key_here
NVIDIA_MODEL=moonshotai/kimi-k2.6
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
NVIDIA_MAX_TOKENS=2200
NVIDIA_TEMPERATURE=0.2
NVIDIA_TOP_P=0.9
```

Optional debug:

```env
NEXUS_DEBUG_PIPELINE=true
```

When `NEXUS_DEBUG_PIPELINE=true`, non-stream API calls may include the backend pipeline object in the JSON response. Keep it off in production.

If the frontend and API are both deployed on the same Vercel project, keep:

```js
window.NEXUS_API_ENDPOINT = "/api/chat";
```

If the frontend is hosted somewhere else, change it in `index.html`:

```js
window.NEXUS_API_ENDPOINT = "https://your-vercel-app.vercel.app/api/chat";
```

---

## Supabase frontend config

In `index.html`, fill these values:

```js
window.NEXUS_SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
window.NEXUS_SUPABASE_ANON_KEY = "YOUR_PUBLIC_ANON_KEY";
```

If you leave them empty, the app still works in local demo mode using `localStorage`, but login/history will not sync across devices.

---

## Supabase SQL schema

Open Supabase → SQL Editor → run this:

```sql
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  mode text not null default 'general_chat',
  messages jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

drop policy if exists "Users can read own conversations" on public.conversations;
create policy "Users can read own conversations"
on public.conversations for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own conversations" on public.conversations;
create policy "Users can insert own conversations"
on public.conversations for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own conversations" on public.conversations;
create policy "Users can update own conversations"
on public.conversations for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own conversations" on public.conversations;
create policy "Users can delete own conversations"
on public.conversations for delete
using (auth.uid() = user_id);

create index if not exists conversations_user_updated_idx
on public.conversations (user_id, archived, pinned desc, updated_at desc);
```

---

## Optional sharing table + RPC

Run this too if you want the Share button to generate public read-only links:

```sql
create table if not exists public.conversation_shares (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  mode text not null default 'general_chat',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.conversation_shares enable row level security;

drop policy if exists "Users can create own share snapshots" on public.conversation_shares;
create policy "Users can create own share snapshots"
on public.conversation_shares for insert
with check (auth.uid() = owner_id);

drop policy if exists "Users can read own share snapshots" on public.conversation_shares;
create policy "Users can read own share snapshots"
on public.conversation_shares for select
using (auth.uid() = owner_id);

drop function if exists public.get_shared_conversation(uuid);
create or replace function public.get_shared_conversation(p_share_id uuid)
returns table (
  id uuid,
  title text,
  mode text,
  messages jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.title, s.mode, s.messages, s.created_at
  from public.conversation_shares s
  where s.id = p_share_id
  limit 1;
$$;

grant execute on function public.get_shared_conversation(uuid) to anon, authenticated;
```

---

## Notes about attachments

The UI supports attaching PDFs, images, and text files.

Current backend behavior:

- `.txt`, `.md`, `.csv`, `.json` content is extracted in the browser and sent to the API.
- PDFs/images are attached visually and their metadata is sent.
- To truly analyze PDF/image content, add a parser such as PDF.js or use a vision/file-capable model and send the content in that model's required format.

---

## Important limitation

This v4 backend is not a full verified medical database. It is a working architecture prototype with local rules for a small set of medicines. Before production use, expand the dataset, add source versioning, add review status fields, and add a stricter safety validator.

---

## Run locally

For static UI only, open `index.html` with a local server. Do not open the file directly with `file://` because module imports may be blocked.

```bash
npx serve .
```

For the API route, deploy to Vercel or use Vercel dev:

```bash
vercel dev
```
