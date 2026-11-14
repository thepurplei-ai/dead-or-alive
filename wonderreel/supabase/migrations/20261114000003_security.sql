-- Grants + Row Level Security. Default: deny. Every exposed table has RLS on.

alter table public.profiles enable row level security;
alter table public.consent_records enable row level security;
alter table public.projects enable row level security;
alter table public.media_assets enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.purchases enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.saves enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_logs enable row level security;
alter table public.provider_webhook_events enable row level security;
alter table public.deletion_requests enable row level security;

-- Start from nothing, then grant the minimum.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

-- ---------- profiles: public columns readable; only safe columns editable ----------
grant select (id, handle, display_name, bio, avatar_path, created_at) on public.profiles to anon, authenticated;
grant update (handle, display_name, bio, avatar_path, remix_default) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to anon, authenticated using (status = 'active' or id = auth.uid());
create policy profiles_edit_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- consent_records: own rows readable; writes only via record_consent()
grant select on public.consent_records to authenticated;
create policy consent_read_own on public.consent_records for select to authenticated using (user_id = auth.uid());

-- ---------- projects: owner only ----------
grant select, delete on public.projects to authenticated;
grant insert (title, prompt, style, aspect, storyboard, remix_template_id, is_family) on public.projects to authenticated;
grant update (title, prompt, style, aspect, storyboard, remix_template_id) on public.projects to authenticated;
create policy projects_owner_select on public.projects for select to authenticated using (owner_id = auth.uid());
create policy projects_owner_insert on public.projects for insert to authenticated with check (owner_id = auth.uid());
create policy projects_owner_update on public.projects for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy projects_owner_delete on public.projects for delete to authenticated using (owner_id = auth.uid());

-- ---------- media, jobs, credits: owner may read; writes only by service role ----------
grant select on public.media_assets to authenticated;
create policy media_owner_read on public.media_assets for select to authenticated using (owner_id = auth.uid());

grant select on public.generation_jobs to authenticated;
create policy jobs_owner_read on public.generation_jobs for select to authenticated using (owner_id = auth.uid());

grant select on public.credit_ledger to authenticated;
create policy ledger_owner_read on public.credit_ledger for select to authenticated using (user_id = auth.uid());

grant select on public.purchases, public.subscription_entitlements to authenticated;
create policy purchases_owner_read on public.purchases for select to authenticated using (user_id = auth.uid());
create policy entitlements_owner_read on public.subscription_entitlements for select to authenticated using (user_id = auth.uid());

-- ---------- posts: approved+visible to all, own posts to owner, everything to moderators ----------
grant select on public.posts to anon, authenticated;
grant update (caption, allow_remix) on public.posts to authenticated;
grant delete on public.posts to authenticated;
create policy posts_read on public.posts for select to anon, authenticated using (
  app_private.post_visible(id, auth.uid())
  or creator_id = auth.uid()
  or app_private.is_moderator(auth.uid())
);
-- Owners may edit caption / remix permission and delete; status is never client-writable (no grant).
create policy posts_owner_update on public.posts for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy posts_owner_delete on public.posts for delete to authenticated using (creator_id = auth.uid());
-- No INSERT grant: posts are only created through request_publish().

-- ---------- likes / saves / follows / blocks ----------
grant select, insert, delete on public.likes, public.saves, public.follows, public.blocks to authenticated;

create policy likes_read on public.likes for select to authenticated using (user_id = auth.uid() or app_private.post_visible(post_id, auth.uid()));
create policy likes_insert on public.likes for insert to authenticated with check (
  user_id = auth.uid() and app_private.is_eligible(auth.uid()) and app_private.post_visible(post_id, auth.uid()));
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());

create policy saves_own on public.saves for select to authenticated using (user_id = auth.uid());
create policy saves_insert on public.saves for insert to authenticated with check (
  user_id = auth.uid() and app_private.post_visible(post_id, auth.uid()));
create policy saves_delete on public.saves for delete to authenticated using (user_id = auth.uid());

create policy follows_read on public.follows for select to authenticated using (true);
create policy follows_insert on public.follows for insert to authenticated with check (
  follower_id = auth.uid() and app_private.is_eligible(auth.uid())
  and not app_private.blocked_between(follower_id, following_id)
  and app_private.is_active(following_id));
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

create policy blocks_own on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- ---------- comments ----------
grant select on public.comments to anon, authenticated;
grant insert (post_id, author_id, parent_id, body) on public.comments to authenticated;
grant delete on public.comments to authenticated;
create policy comments_read on public.comments for select to anon, authenticated using (
  author_id = auth.uid()
  or app_private.is_moderator(auth.uid())
  or (moderation_status = 'approved' and app_private.post_visible(post_id, auth.uid())
      and not app_private.blocked_between(author_id, auth.uid())));
create policy comments_insert on public.comments for insert to authenticated with check (
  author_id = auth.uid() and app_private.is_eligible(auth.uid()) and app_private.flag('comments_enabled')
  and app_private.post_visible(post_id, auth.uid()));
create policy comments_delete on public.comments for delete to authenticated using (
  author_id = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.creator_id = auth.uid()));

-- ---------- reports ----------
grant select on public.reports to authenticated;
grant insert (reporter_id, post_id, comment_id, reason, details) on public.reports to authenticated;
create policy reports_read on public.reports for select to authenticated using (reporter_id = auth.uid() or app_private.is_moderator(auth.uid()));
create policy reports_insert on public.reports for insert to authenticated with check (
  reporter_id = auth.uid() and (
    (post_id is not null and (app_private.post_visible(post_id, auth.uid()) or exists (select 1 from public.posts p where p.id = post_id and p.status = 'approved')))
    or (comment_id is not null)));

-- ---------- notifications ----------
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- operations ----------
grant select on public.feature_flags to anon, authenticated;
create policy flags_read on public.feature_flags for select to anon, authenticated using (true);

grant select on public.audit_logs to authenticated;
create policy audit_moderators on public.audit_logs for select to authenticated using (app_private.is_moderator(auth.uid()));
-- provider_webhook_events, deletion_requests: no client access at all.

-- ---------- RPC execute grants ----------
grant execute on function public.feed(text, timestamptz, int) to anon, authenticated;
grant execute on function public.my_profile(), public.declare_birth_date(date), public.record_consent(text, text),
  public.my_credit_balance(), public.request_publish(uuid, text, boolean, text[]), public.start_remix(uuid, uuid),
  public.admin_queue(), public.admin_decide(text, uuid, text, text), public.admin_set_flag(text, boolean),
  public.cancel_job(uuid) to authenticated;
-- service_* functions are for Edge Functions only (service role).
grant execute on function public.service_create_job(uuid, uuid, public.job_kind, text, text, text, smallint, uuid, text, text, int, text),
  public.service_claim_jobs(int, int), public.service_update_job(uuid, public.job_status, text, uuid, text, int),
  public.service_reap_stalled(interval), public.service_decide(uuid, text, uuid, text, text) to service_role;
-- RLS helper functions must be callable inside policies by API roles.
grant usage on schema app_private to anon, authenticated, service_role;
grant execute on function app_private.post_visible(uuid, uuid), app_private.is_active(uuid), app_private.is_moderator(uuid), app_private.is_eligible(uuid),
  app_private.blocked_between(uuid, uuid), app_private.flag(text) to anon, authenticated, service_role;
