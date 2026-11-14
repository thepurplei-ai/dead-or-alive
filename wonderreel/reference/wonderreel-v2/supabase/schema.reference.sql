-- WonderReel PROPOSED SCHEMA — review and test in a Supabase staging project before deployment.
-- Not deployed. This is not a migration and should not be run on a live database without review.
-- All user media buckets must be PRIVATE with signed, short-lived access URLs.

create extension if not exists pgcrypto;

create table if not exists public.creator_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check(handle ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text not null default '' check (char_length(bio)<=500),
  avatar_key text,
  created_at timestamptz not null default now()
);

create table if not exists public.creations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(char_length(title) between 1 and 160),
  prompt text not null check(char_length(prompt) between 1 and 4000),
  storyboard jsonb not null default '[]'::jsonb,
  source_storage_key text,
  output_storage_key text,
  is_family boolean not null default false,
  contains_minor boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  creation_id uuid references public.creations(id) on delete set null,
  title text not null check(char_length(title) between 1 and 160),
  caption text not null default '' check(char_length(caption)<=2000),
  poster_key text not null,
  video_key text not null,
  visibility text not null default 'private' check(visibility in ('private','public')),
  moderation_status text not null default 'draft' check(moderation_status in ('draft','pending','approved','rejected')),
  contains_minor boolean not null default false,
  remix_allowed boolean not null default false,
  template_prompt text,
  source_post_id uuid references public.posts(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint no_public_minors check (not (visibility='public' and contains_minor=true)),
  constraint published_only_when_approved check (not (visibility='public' and moderation_status <> 'approved'))
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,following_id),
  check(follower_id<>following_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check(char_length(body) between 1 and 600),
  moderation_status text not null default 'pending' check(moderation_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  reason text not null check(char_length(reason) between 5 and 500),
  created_at timestamptz not null default now(),
  unique(reporter_id,post_id)
);

create index if not exists posts_approved_feed_idx on public.posts(published_at desc) where visibility='public' and moderation_status='approved' and contains_minor=false;
create index if not exists creations_owner_idx on public.creations(owner_id,created_at desc);
create index if not exists comments_post_idx on public.post_comments(post_id,created_at desc);

alter table public.creator_profiles enable row level security;
alter table public.creations enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.follows enable row level security;
alter table public.post_comments enable row level security;
alter table public.content_reports enable row level security;

-- Profiles are visible, but editing remains owner-only. Adult verification must occur server-side separately.
create policy "profiles readable" on public.creator_profiles for select to authenticated using (true);
create policy "create own profile" on public.creator_profiles for insert to authenticated with check (id=(select auth.uid()));
create policy "edit own profile" on public.creator_profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));

create policy "read own creations" on public.creations for select to authenticated using(owner_id=(select auth.uid()));
create policy "insert own creations" on public.creations for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "edit own creations" on public.creations for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "delete own creations" on public.creations for delete to authenticated using(owner_id=(select auth.uid()));

-- Only a trusted backend is allowed to promote a post to public and approved.
create policy "read approved or own posts" on public.posts for select to authenticated using (
  (visibility='public' and moderation_status='approved' and contains_minor=false) or creator_id=(select auth.uid())
);
create policy "create private draft posts" on public.posts for insert to authenticated with check (
  creator_id=(select auth.uid()) and visibility='private' and moderation_status='draft'
);
create policy "edit private draft posts" on public.posts for update to authenticated using (
  creator_id=(select auth.uid()) and visibility='private' and moderation_status='draft'
) with check (
  creator_id=(select auth.uid()) and visibility='private' and moderation_status='draft'
);
create policy "delete own posts" on public.posts for delete to authenticated using(creator_id=(select auth.uid()));

create policy "read likes for approved posts" on public.post_likes for select to authenticated using(
 exists(select 1 from public.posts p where p.id=post_id and p.visibility='public' and p.moderation_status='approved' and not p.contains_minor)
);
create policy "like approved posts" on public.post_likes for insert to authenticated with check (
 user_id=(select auth.uid()) and exists(select 1 from public.posts p where p.id=post_id and p.visibility='public' and p.moderation_status='approved' and not p.contains_minor)
);
create policy "unlike own" on public.post_likes for delete to authenticated using(user_id=(select auth.uid()));

create policy "read follows" on public.follows for select to authenticated using(true);
create policy "follow as self" on public.follows for insert to authenticated with check(follower_id=(select auth.uid()));
create policy "unfollow as self" on public.follows for delete to authenticated using(follower_id=(select auth.uid()));

create policy "read approved or own comments" on public.post_comments for select to authenticated using (
  author_id=(select auth.uid()) or (
    moderation_status='approved' and exists(select 1 from public.posts p where p.id=post_id and p.visibility='public' and p.moderation_status='approved' and not p.contains_minor)
  )
);
create policy "submit comments for moderation" on public.post_comments for insert to authenticated with check (
  author_id=(select auth.uid()) and moderation_status='pending' and exists(select 1 from public.posts p where p.id=post_id and p.visibility='public' and p.moderation_status='approved' and not p.contains_minor)
);
create policy "delete own comments" on public.post_comments for delete to authenticated using(author_id=(select auth.uid()));

create policy "read own reports" on public.content_reports for select to authenticated using(reporter_id=(select auth.uid()));
create policy "report public posts" on public.content_reports for insert to authenticated with check (
 reporter_id=(select auth.uid()) and exists(select 1 from public.posts p where p.id=post_id and p.visibility='public' and p.moderation_status='approved' and not p.contains_minor)
);

-- Launch blockers: adult-account verification, trustworthy moderation/webhooks,
-- verified consent, stable object-ownership checks on media keys, quota/rate limits,
-- data retention and deletion, copyright/likeness handling, DSA/COPPA/GDPR review,
-- server validation of authorship + remix eligibility, admin audit logs, proper storage policies.
