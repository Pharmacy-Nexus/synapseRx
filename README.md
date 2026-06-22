# Nexus Clinical Pharmacist UI Rebuild

A clean ChatGPT-inspired professional chat workspace with:

- Login / Sign up UI
- Optional Supabase Auth + database persistence
- Local demo fallback when Supabase keys are empty
- Responsive collapsible sidebar
- Four modes: General Chat, Case Analysis, Drug Interaction, Drug Reverse
- Chat history with auto-title from the first message, Pin, Rename, Export PDF, Share, Archive, Delete
- Dark / Light mode
- Markdown AI responses, callouts, tables, and code blocks
- Streaming response UI + thinking timer
- Stop Generating button
- Auto-resizing input
- File attachment UI for PDFs/images/text files
- Cleaner PDF export using html2pdf.js for better visual formatting

---

## Files

```txt
index.html
style.css
script.js
api/chat.js
vercel.json
README.md
```

---

## 1) Vercel environment variables

Set these in Vercel Project Settings → Environment Variables:

```env
NVIDIA_API_KEY=your_key_here
NVIDIA_MODEL=moonshotai/kimi-k2.6
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
NVIDIA_MAX_TOKENS=1800
NVIDIA_TEMPERATURE=0.25
NVIDIA_TOP_P=0.9
```

If the frontend and API are both deployed on the same Vercel project, keep:

```js
window.NEXUS_API_ENDPOINT = "/api/chat";
```

If the frontend is hosted somewhere else, change it in `index.html`:

```js
window.NEXUS_API_ENDPOINT = "https://your-vercel-app.vercel.app/api/chat";
```

---

## 2) Supabase frontend config

In `index.html`, fill these values:

```js
window.NEXUS_SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
window.NEXUS_SUPABASE_ANON_KEY = "YOUR_PUBLIC_ANON_KEY";
```

If you leave them empty, the app still works in local demo mode using `localStorage`, but login/history will not sync across devices.

---

## 3) Supabase SQL schema

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

## 4) Optional sharing table + RPC

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

## 5) Notes about attachments

The UI supports attaching PDFs, images, and text files.

Current backend behavior:

- `.txt`, `.md`, `.csv`, `.json` content is extracted in the browser and sent to the API.
- PDFs/images are attached visually and their metadata is sent.
- To truly analyze PDF/image content, add a parser such as PDF.js or use a vision/file-capable model and send the content in that model's required format.

---

## 6) Run locally

For static UI only, open `index.html` with a local server. Do not open the file directly with `file://` because module imports may be blocked.

Example:

```bash
npx serve .
```

For the API route, deploy to Vercel or use Vercel dev:

```bash
vercel dev
```

## v3 responsive note

This version switches into the compact shell earlier, so the mobile-style layout is triggered at normal 100% browser zoom on laptop/mobile preview tools. You should not need to zoom to 200% to make the layout behave.

## v4.2 Polish Update

Added:

- Medical/pharmacy scope guard: Nexus refuses non-medical questions and redirects the user to clinical/pharmacy use.
- Related question suggestions after each assistant answer: exactly 3 contextual next questions.
- Message rail/minimap on the right side of the chat for quick navigation between messages.
- Copy button for user and assistant messages.
- Edit button for user messages: edits a sent message and regenerates the conversation from that point.
- Cleaner callout UI with icons and improved inline markdown rendering inside callouts.
- Better message action UI and mobile-safe controls.

Recommended env:

```env
NVIDIA_API_KEY=your_key_here
NVIDIA_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
NVIDIA_MODEL=moonshotai/kimi-k2.6
NVIDIA_MAX_TOKENS=850
NEXUS_FAST_LOCAL_FIRST=true
NEXUS_COMPOSER_TIMEOUT_MS=25000
```
