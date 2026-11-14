-- WonderReel core schema.
-- Rules: every table has RLS; trusted state (roles, adult status, moderation state,
-- credit balances, job status) can only be changed by SECURITY DEFINER functions or
-- the service role used by Edge Functions. Clients never get the service role.

create extension if not exists pgcrypto;
create schema if not exists app_private;
revoke all on schema app_private from public;

-- ---------- Enums ----------
create type public.adult_status as enum ('unknown', 'declared_adult', 'verified_adult', 'underage');
create type public.user_role as enum ('user', 'moderator', 'admin');
create type public.account_status as enum ('active', 'suspended', 'deleted');
create type public.job_kind as enum ('text_to_image', 'image_edit', 'image_to_video', 'video_to_video');
create type public.job_status as enum ('queued', 'processing', 'output_review', 'completed', 'failed', 'cancelled', 'rejected');
create type public.post_status as enum ('pending_review', 'approved', 'rejected', 'removed');
create type public.comment_status as enum ('pending', 'approved', 'rejected', 'removed');
create type public.report_status as enum ('open', 'actioned', 'dismissed');
create type public.media_status as enum ('pending_upload', 'ready', 'rejected', 'deleted');
create type public.ledger_kind as enum ('grant', 'reserve', 'refund', 'settle', 'purchase', 'adjust');

-- ---------- Profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null default '' check (char_length(display_name) <= 80),
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_path text,
  remix_default boolean not null default true,
  -- trusted fields (no client UPDATE grant):
  adult_status public.adult_status not null default 'unknown',
  role public.user_role not null default 'user',
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consent_records (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('terms', 'privacy', 'ai_processing', 'adult_declaration', 'media_rights')),
  version text not null check (char_length(version) between 1 and 40),
  created_at timestamptz not null default now()
);

-- ---------- Studio ----------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 160),
  prompt text not null check (char_length(prompt) between 1 and 4000),
  style text not null default 'Cinematic' check (style in ('Cinematic', 'Animated', 'Fantasy', '3D', 'Comic')),
  aspect text not null default '9:16' check (aspect in ('9:16', '1:1', '16:9')),
  storyboard jsonb,
  remix_template_id text check (char_length(remix_template_id) <= 80),
  remix_of_post uuid,
  is_family boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects(owner_id, updated_at desc);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  bucket text not null check (bucket in ('private-media', 'public-media')),
  path text not null unique,
  role text not null check (role in ('source', 'output', 'poster', 'public_copy')),
  kind text not null check (kind in ('image', 'video')),
  mime_type text not null,
  size_bytes bigint check (size_bytes > 0),
  duration_ms integer check (duration_ms >= 0),
  sha256 text,
  status public.media_status not null default 'pending_upload',
  contains_minor boolean not null default false,
  created_at timestamptz not null default now()
);
create index media_owner_idx on public.media_assets(owner_id, created_at desc);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind public.job_kind not null,
  status public.job_status not null default 'queued',
  provider text not null,
  provider_model text,
  provider_task_id text,
  prompt text not null check (char_length(prompt) between 1 and 4000),
  style text not null,
  aspect text not null,
  scene_number smallint check (scene_number between 1 and 12),
  source_media_id uuid references public.media_assets(id) on delete set null,
  output_media_id uuid references public.media_assets(id) on delete set null,
  credits_reserved integer not null check (credits_reserved >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  attempts integer not null default 0,
  error_message text,
  next_poll_at timestamptz not null default now(),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);
create index jobs_owner_idx on public.generation_jobs(owner_id, created_at desc);
create index jobs_work_idx on public.generation_jobs(next_poll_at) where status in ('queued', 'processing');

-- ---------- Credits (append-only ledger; balance = sum(delta)) ----------
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  kind public.ledger_kind not null,
  job_id uuid references public.generation_jobs(id) on delete set null,
  purchase_id uuid,
  reason text,
  created_at timestamptz not null default now()
);
-- At most one reserve / refund / settle per job: retries can never double-charge or double-refund.
create unique index ledger_job_once on public.credit_ledger(job_id, kind) where job_id is not null;
create index ledger_user_idx on public.credit_ledger(user_id, created_at desc);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store text not null check (store in ('google_play', 'app_store')),
  product_id text not null,
  purchase_token text not null unique,
  state text not null check (state in ('pending', 'verified', 'refunded', 'invalid')),
  credits integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.subscription_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null,
  active_until timestamptz not null,
  updated_at timestamptz not null default now()
);

-- ---------- Social ----------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  output_media_id uuid references public.media_assets(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  caption text not null default '' check (char_length(caption) <= 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  status public.post_status not null default 'pending_review',
  allow_remix boolean not null default false,
  -- Story structure only. Never media paths, faces or voices.
  template jsonb,
  remix_of_post uuid references public.posts(id) on delete set null,
  poster_path text,
  video_path text,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  contains_minor boolean not null default false,
  ai_generated boolean not null default true check (ai_generated),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint no_public_minors check (not (status = 'approved' and contains_minor)),
  constraint published_when_approved check ((status = 'approved') = (published_at is not null))
);
create index posts_feed_idx on public.posts(published_at desc) where status = 'approved';
create index posts_creator_idx on public.posts(creator_id, created_at desc);
alter table public.projects add constraint projects_remix_of_post_fkey foreign key (remix_of_post) references public.posts(id) on delete set null;

create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table public.saves (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 600),
  moderation_status public.comment_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments(post_id, created_at desc);
alter table public.comments add constraint comments_author_profile_fkey foreign key (author_id) references public.profiles(id) on delete cascade;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null check (reason in ('minor', 'likeness', 'sexual', 'violence', 'harassment', 'copyright', 'spam', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  check ((post_id is not null) <> (comment_id is not null))
);
create unique index reports_once_post on public.reports(reporter_id, post_id) where post_id is not null;
create unique index reports_once_comment on public.reports(reporter_id, comment_id) where comment_id is not null;

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

-- ---------- Operations ----------
create table public.feature_flags (
  key text primary key,
  enabled boolean not null,
  updated_at timestamptz not null default now()
);
insert into public.feature_flags(key, enabled) values
  ('generation_enabled', true),
  ('publishing_enabled', true),
  ('comments_enabled', true),
  ('family_cloud_enabled', false);  -- must stay false until legal/provider/consent review

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_kind text not null,
  target_id text not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.provider_webhook_events (
  id text primary key,                    -- provider's event id: duplicates are ignored
  provider text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);

create table app_private.rate_events (
  user_id uuid not null,
  action text not null,
  at timestamptz not null default now()
);
create index rate_events_idx on app_private.rate_events(user_id, action, at desc);

create table public.deletion_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
