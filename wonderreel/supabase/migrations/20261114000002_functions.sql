-- Trusted helpers, triggers and RPCs.

-- ---------- Helpers ----------
create or replace function app_private.is_moderator(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.role in ('moderator', 'admin') and p.status = 'active');
$$;

create or replace function app_private.is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.role = 'admin' and p.status = 'active');
$$;

create or replace function app_private.is_eligible(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.status = 'active' and p.adult_status in ('declared_adult', 'verified_adult')
  );
$$;

create or replace function app_private.is_active(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = uid and p.status = 'active');
$$;

create or replace function app_private.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function app_private.post_visible(pid uuid, viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p join public.profiles c on c.id = p.creator_id
    where p.id = pid and p.status = 'approved' and not p.contains_minor and c.status = 'active'
      and not app_private.blocked_between(p.creator_id, viewer)
  );
$$;

create or replace function app_private.flag(k text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from public.feature_flags where key = k), false);
$$;

create or replace function app_private.check_rate(uid uuid, act text, max_count int, win interval) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if uid is null then return; end if;
  if (select count(*) from app_private.rate_events where user_id = uid and action = act and at > now() - win) >= max_count then
    raise exception 'rate_limited: too many % actions, please slow down', act using errcode = 'P0429';
  end if;
  insert into app_private.rate_events(user_id, action) values (uid, act);
end $$;

create or replace function app_private.audit(actor uuid, act text, kind text, target text, note text) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs(actor_id, action, target_kind, target_id, note) values (actor, act, kind, target, note);
$$;

create or replace function app_private.balance(uid uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(delta), 0)::int from public.credit_ledger where user_id = uid;
$$;

-- Keep only story structure from a storyboard: no URLs, media keys, faces or voices.
create or replace function app_private.sanitize_template(board jsonb, fallback_title text, fallback_prompt text, fallback_style text)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'title', left(coalesce(board->>'title', fallback_title), 160),
    'prompt', left(regexp_replace(coalesce(board->>'prompt', fallback_prompt), 'https?://\S+', '', 'g'), 1500),
    'style', coalesce(board->>'style', fallback_style),
    'scenes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', (ord)::int,
        'title', left(regexp_replace(coalesce(s->>'title', 'Scene'), 'https?://\S+', '', 'g'), 100),
        'description', left(regexp_replace(coalesce(s->>'description', ''), 'https?://\S+', '', 'g'), 300),
        'camera', left(coalesce(s->>'camera', ''), 80),
        'durationSec', least(greatest(coalesce((s->>'durationSec')::numeric, 5), 2), 10)
      ) order by ord)
      from jsonb_array_elements(case when jsonb_typeof(board->'scenes') = 'array' then board->'scenes' else '[]'::jsonb end)
        with ordinality as t(s, ord)
      where ord <= 8
    ), '[]'::jsonb)
  );
$$;

-- ---------- Triggers ----------
create or replace function app_private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values (new.id, '') on conflict do nothing;
  -- Free starter allowance. Adjust after measuring real provider costs.
  insert into public.credit_ledger(user_id, delta, kind, reason) values (new.id, 10, 'grant', 'Welcome credits');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.on_auth_user_created();

create or replace function app_private.touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function app_private.touch();
create trigger projects_touch before update on public.projects for each row execute function app_private.touch();
create trigger jobs_touch before update on public.generation_jobs for each row execute function app_private.touch();

-- Clients cannot change who owns a project.
create or replace function app_private.projects_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then raise exception 'owner cannot change'; end if;
  if tg_op = 'INSERT' and auth.uid() is not null and new.owner_id <> auth.uid() then raise exception 'not your project'; end if;
  return new;
end $$;
create trigger projects_guard before insert or update on public.projects for each row execute function app_private.projects_guard();

-- Comments from clients always start in moderation; counters stay correct.
create or replace function app_private.comments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.moderation_status := 'pending';
    perform app_private.check_rate(new.author_id, 'comment', 20, interval '10 minutes');
  end if;
  return new;
end $$;
create trigger comments_guard before insert on public.comments for each row execute function app_private.comments_guard();

create or replace function app_private.comment_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.posts p set comment_count = (
    select count(*) from public.comments c where c.post_id = p.id and c.moderation_status = 'approved'
  ) where p.id = coalesce(new.post_id, old.post_id);
  return null;
end $$;
create trigger comments_count after insert or update or delete on public.comments for each row execute function app_private.comment_count();

create or replace function app_private.like_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform app_private.check_rate(new.user_id, 'like', 300, interval '1 hour');
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
create trigger likes_count after insert or delete on public.likes for each row execute function app_private.like_count();

create or replace function app_private.rate_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform app_private.check_rate(new.follower_id, 'follow', 100, interval '1 hour'); return new; end $$;
create trigger follows_rate before insert on public.follows for each row execute function app_private.rate_follow();

create or replace function app_private.rate_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform app_private.check_rate(new.reporter_id, 'report', 30, interval '1 hour'); return new; end $$;
create trigger reports_rate before insert on public.reports for each row execute function app_private.rate_report();

-- Blocking also removes follows in both directions.
create or replace function app_private.on_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return null;
end $$;
create trigger blocks_cleanup after insert on public.blocks for each row execute function app_private.on_block();

-- ---------- Account RPCs ----------
create or replace function public.my_profile() returns table (
  id uuid, handle text, display_name text, bio text, avatar_path text, remix_default boolean,
  adult_status public.adult_status, role public.user_role, status public.account_status, created_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select p.id, p.handle, p.display_name, p.bio, p.avatar_path, p.remix_default, p.adult_status, p.role, p.status, p.created_at
  from public.profiles p where p.id = auth.uid();
$$;

-- Stores only the result, never the birth date. Can be answered once.
create or replace function public.declare_birth_date(p_dob date) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cur public.adult_status; age int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select adult_status into cur from public.profiles where id = uid;
  if cur <> 'unknown' then
    return case when cur = 'underage' then 'underage' else 'declared_adult' end;
  end if;
  if p_dob > current_date or p_dob < date '1900-01-01' then raise exception 'invalid date of birth'; end if;
  age := extract(year from age(current_date, p_dob));
  if age >= 18 then
    update public.profiles set adult_status = 'declared_adult' where id = uid;
    insert into public.consent_records(user_id, kind, version) values (uid, 'adult_declaration', 'v1');
    return 'declared_adult';
  end if;
  update public.profiles set adult_status = 'underage', status = 'suspended' where id = uid;
  return 'underage';
end $$;

create or replace function public.record_consent(p_kind text, p_version text) returns void
language sql security definer set search_path = '' as $$
  insert into public.consent_records(user_id, kind, version)
  select auth.uid(), p_kind, p_version where auth.uid() is not null;
$$;

create or replace function public.my_credit_balance() returns integer
language sql stable security definer set search_path = '' as $$
  select app_private.balance(auth.uid());
$$;

-- ---------- Publishing (always moderated) ----------
create or replace function public.request_publish(p_project_id uuid, p_caption text, p_allow_remix boolean, p_tags text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  proj public.projects;
  job public.generation_jobs;
  out_media public.media_assets;
  origin uuid;
  new_id uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not app_private.is_eligible(uid) then raise exception 'only adult accounts can publish'; end if;
  if not app_private.flag('publishing_enabled') then raise exception 'publishing is paused'; end if;
  perform app_private.check_rate(uid, 'publish', 10, interval '1 day');

  select * into proj from public.projects where id = p_project_id and owner_id = uid;
  if not found then raise exception 'project not found'; end if;
  if proj.is_family then raise exception 'family projects can never be published'; end if;
  if exists (select 1 from public.posts where project_id = proj.id and status in ('pending_review', 'approved')) then
    raise exception 'this project is already published or waiting for review';
  end if;

  select * into job from public.generation_jobs
  where project_id = proj.id and owner_id = uid and status = 'completed' and output_media_id is not null
  order by updated_at desc limit 1;
  if not found then raise exception 'render a result before publishing'; end if;
  select * into out_media from public.media_assets where id = job.output_media_id and owner_id = uid and status = 'ready';
  if not found or out_media.contains_minor then raise exception 'this result cannot be published'; end if;

  -- Keep lineage only to a still-visible, remixable original.
  if proj.remix_of_post is not null and app_private.post_visible(proj.remix_of_post, uid)
     and exists (select 1 from public.posts where id = proj.remix_of_post and allow_remix) then
    origin := proj.remix_of_post;
  end if;

  insert into public.posts(creator_id, project_id, output_media_id, title, caption, tags, allow_remix, template, remix_of_post)
  values (
    uid, proj.id, out_media.id, proj.title, left(coalesce(p_caption, ''), 2000),
    coalesce((select array_agg(distinct lower(t)) from unnest(p_tags[1:10]) t where t ~ '^[a-z0-9_]{1,40}$'), '{}'),
    coalesce(p_allow_remix, false),
    app_private.sanitize_template(proj.storyboard, proj.title, proj.prompt, proj.style),
    origin
  ) returning id into new_id;
  perform app_private.audit(uid, 'publish_request', 'post', new_id::text, null);
  return new_id;
end $$;

-- Link a Studio project to the post it remixes (only if the post allows remixing).
create or replace function public.start_remix(p_project_id uuid, p_post_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); tpl jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not app_private.post_visible(p_post_id, uid) then raise exception 'post not available'; end if;
  select template into tpl from public.posts where id = p_post_id and allow_remix;
  if tpl is null then raise exception 'the creator has not allowed remixes of this video'; end if;
  update public.projects set remix_of_post = p_post_id, remix_template_id = p_post_id::text
  where id = p_project_id and owner_id = uid and not is_family;
  if not found then raise exception 'project not found'; end if;
  return tpl;
end $$;

-- ---------- Feed ----------
create or replace function public.feed(p_tab text default 'for_you', p_cursor timestamptz default null, p_limit int default 10)
returns table (
  id uuid, creator_id uuid, handle text, title text, caption text, tags text[], like_count int, comment_count int,
  poster_path text, video_path text, allow_remix boolean, template jsonb, remixed_from_post uuid, remixed_from_handle text,
  published_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select p.id, p.creator_id, c.handle, p.title, p.caption, p.tags, p.like_count, p.comment_count,
         p.poster_path, p.video_path,
         p.allow_remix and not app_private.blocked_between(p.creator_id, auth.uid()),
         case when p.allow_remix then p.template end,
         case when o.id is not null and app_private.post_visible(o.id, auth.uid()) then o.id end,
         case when o.id is not null and app_private.post_visible(o.id, auth.uid()) then oc.handle end,
         p.published_at
  from public.posts p
  join public.profiles c on c.id = p.creator_id
  left join public.posts o on o.id = p.remix_of_post
  left join public.profiles oc on oc.id = o.creator_id
  where p.status = 'approved' and not p.contains_minor and c.status = 'active'
    and not app_private.blocked_between(p.creator_id, auth.uid())
    and (p_cursor is null or p.published_at < p_cursor)
    and (p_tab <> 'following' or exists (
      select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.creator_id))
  order by p.published_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;

-- ---------- Moderation ----------
create or replace function public.admin_queue() returns table (
  kind text, id uuid, title text, body text, handle text, created_at timestamptz, preview_url text, output_media_id uuid
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_moderator(auth.uid()) then raise exception 'moderators only'; end if;
  return query
    select 'post'::text, p.id, p.title, p.caption, coalesce(c.handle, '?'), p.created_at, null::text, p.output_media_id
      from public.posts p left join public.profiles c on c.id = p.creator_id where p.status = 'pending_review'
    union all
    select 'comment', m.id, 'Comment', m.body, coalesce(c.handle, '?'), m.created_at, null, null
      from public.comments m left join public.profiles c on c.id = m.author_id where m.moderation_status = 'pending'
    union all
    select 'report', r.id, 'Report: ' || r.reason, r.details || coalesce(' · post ' || r.post_id::text, ' · comment ' || r.comment_id::text),
           coalesce(c.handle, '?'), r.created_at, null, null
      from public.reports r left join public.profiles c on c.id = r.reporter_id where r.status = 'open'
    order by 6 asc;
end $$;

-- Shared by admin_decide (moderator session) and the moderate Edge Function (service role).
create or replace function app_private.decide(actor uuid, p_kind text, p_id uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare rep public.reports;
begin
  if not app_private.is_moderator(actor) then raise exception 'moderators only'; end if;
  if p_kind = 'post' then
    if p_decision = 'approve' then
      update public.posts set status = 'approved', published_at = now()
      where id = p_id and status = 'pending_review' and not contains_minor and (video_path is not null or poster_path is not null);
      if not found then raise exception 'post must be pending with a public media copy before approval'; end if;
      insert into public.notifications(user_id, kind, payload) select creator_id, 'post_approved', jsonb_build_object('post_id', id) from public.posts where id = p_id;
    elsif p_decision in ('reject', 'takedown') then
      update public.posts set status = case when p_decision = 'reject' then 'rejected'::public.post_status else 'removed'::public.post_status end,
                              published_at = null
      where id = p_id;
      insert into public.notifications(user_id, kind, payload) select creator_id, 'post_' || p_decision, jsonb_build_object('post_id', id, 'note', p_note) from public.posts where id = p_id;
    else raise exception 'unknown decision'; end if;
  elsif p_kind = 'comment' then
    update public.comments set moderation_status = case when p_decision = 'approve' then 'approved'::public.comment_status
      when p_decision = 'reject' then 'rejected'::public.comment_status else 'removed'::public.comment_status end
    where id = p_id;
  elsif p_kind = 'report' then
    select * into rep from public.reports where id = p_id;
    if not found then raise exception 'report not found'; end if;
    if p_decision = 'takedown' then
      if rep.post_id is not null then update public.posts set status = 'removed', published_at = null where id = rep.post_id; end if;
      if rep.comment_id is not null then update public.comments set moderation_status = 'removed' where id = rep.comment_id; end if;
      update public.reports set status = 'actioned'
      where status = 'open' and (post_id = rep.post_id or comment_id = rep.comment_id);
    elsif p_decision = 'dismiss' then
      update public.reports set status = 'dismissed' where id = p_id;
    else raise exception 'unknown decision'; end if;
  else raise exception 'unknown kind'; end if;
  perform app_private.audit(actor, p_kind || ':' || p_decision, p_kind, p_id::text, p_note);
end $$;

create or replace function public.admin_decide(p_kind text, p_id uuid, p_decision text, p_note text default '') returns void
language sql security definer set search_path = '' as $$
  select app_private.decide(auth.uid(), p_kind, p_id, p_decision, p_note);
$$;

create or replace function public.service_decide(p_actor uuid, p_kind text, p_id uuid, p_decision text, p_note text default '') returns void
language sql security definer set search_path = '' as $$
  select app_private.decide(p_actor, p_kind, p_id, p_decision, p_note);
$$;

create or replace function public.admin_set_flag(p_key text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.is_admin(auth.uid()) then raise exception 'admins only'; end if;
  if p_key = 'family_cloud_enabled' and p_enabled then
    raise exception 'family cloud processing is locked off until consent, provider and legal review are complete';
  end if;
  update public.feature_flags set enabled = p_enabled, updated_at = now() where key = p_key;
  if not found then raise exception 'unknown flag'; end if;
  perform app_private.audit(auth.uid(), 'flag:' || p_key || '=' || p_enabled, 'flag', p_key, null);
end $$;

-- ---------- Generation jobs (service role only) ----------
create or replace function public.service_create_job(
  p_owner uuid, p_project uuid, p_kind public.job_kind, p_prompt text, p_style text, p_aspect text,
  p_scene smallint, p_source uuid, p_provider text, p_model text, p_cost int, p_idem text
) returns public.generation_jobs language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs; proj public.projects; src public.media_assets;
begin
  select * into j from public.generation_jobs where owner_id = p_owner and idempotency_key = p_idem;
  if found then return j; end if;   -- retried request: same job, no second charge

  if not app_private.flag('generation_enabled') then raise exception 'generation is paused'; end if;
  if not app_private.is_eligible(p_owner) then raise exception 'only adult accounts can generate'; end if;
  select * into proj from public.projects where id = p_project and owner_id = p_owner;
  if not found then raise exception 'project not found'; end if;
  if proj.is_family and not app_private.flag('family_cloud_enabled') then
    raise exception 'cloud AI is disabled for Family Mode';
  end if;
  if p_kind <> 'text_to_image' then
    select * into src from public.media_assets where id = p_source and owner_id = p_owner and role = 'source' and status = 'ready';
    if not found then raise exception 'source media not found'; end if;
    if src.contains_minor then raise exception 'media with minors cannot be sent to cloud AI'; end if;
    if (p_kind in ('image_edit', 'image_to_video') and src.kind <> 'image') or (p_kind = 'video_to_video' and src.kind <> 'video') then
      raise exception 'wrong media type for this render';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 7));
  if (select count(*) from public.generation_jobs where owner_id = p_owner and status in ('queued', 'processing', 'output_review')) >= 2 then
    raise exception 'two renders are already running; wait for one to finish';
  end if;
  perform app_private.check_rate(p_owner, 'generate', 20, interval '1 hour');
  if app_private.balance(p_owner) < p_cost then raise exception 'not enough credits'; end if;

  insert into public.generation_jobs(owner_id, project_id, kind, prompt, style, aspect, scene_number, source_media_id,
                                     provider, provider_model, credits_reserved, idempotency_key)
  values (p_owner, p_project, p_kind, p_prompt, p_style, p_aspect, p_scene, p_source, p_provider, p_model, p_cost, p_idem)
  returning * into j;
  insert into public.credit_ledger(user_id, delta, kind, job_id, reason) values (p_owner, -p_cost, 'reserve', j.id, 'Render ' || p_kind);
  return j;
end $$;

-- Workers lease due jobs so two workers never process the same job.
create or replace function public.service_claim_jobs(p_limit int, p_lease_seconds int) returns setof public.generation_jobs
language sql security definer set search_path = '' as $$
  update public.generation_jobs j set locked_until = now() + make_interval(secs => p_lease_seconds), attempts = j.attempts + 1
  where j.id in (
    select id from public.generation_jobs
    where status in ('queued', 'processing') and next_poll_at <= now() and (locked_until is null or locked_until < now())
    order by next_poll_at limit p_limit for update skip locked
  )
  returning j.*;
$$;

create or replace function public.service_update_job(
  p_id uuid, p_status public.job_status, p_provider_task text default null, p_output uuid default null,
  p_error text default null, p_next_poll_seconds int default 10
) returns public.generation_jobs language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs; allowed boolean;
begin
  select * into j from public.generation_jobs where id = p_id for update;
  if not found then raise exception 'job not found'; end if;
  allowed := case j.status
    when 'queued' then p_status in ('queued', 'processing', 'failed', 'cancelled', 'rejected')
    when 'processing' then p_status in ('processing', 'output_review', 'completed', 'failed', 'cancelled', 'rejected')
    when 'output_review' then p_status in ('completed', 'rejected', 'failed')
    else false end;
  if not allowed then return j; end if;  -- terminal or illegal transition: ignore (idempotent)

  update public.generation_jobs set
    status = p_status,
    provider_task_id = coalesce(p_provider_task, provider_task_id),
    output_media_id = coalesce(p_output, output_media_id),
    error_message = left(p_error, 300),
    next_poll_at = now() + make_interval(secs => greatest(p_next_poll_seconds, 1)),
    locked_until = null
  where id = p_id returning * into j;

  if p_status in ('failed', 'cancelled', 'rejected') then
    insert into public.credit_ledger(user_id, delta, kind, job_id, reason)
    values (j.owner_id, j.credits_reserved, 'refund', j.id, 'Refund: render ' || p_status)
    on conflict do nothing;
  elsif p_status = 'completed' then
    insert into public.credit_ledger(user_id, delta, kind, job_id, reason)
    values (j.owner_id, 0, 'settle', j.id, 'Render completed') on conflict do nothing;
  end if;
  return j;
end $$;

-- Owner asks to cancel; worker also tells the provider when possible.
create or replace function public.cancel_job(p_id uuid) returns public.generation_jobs
language plpgsql security definer set search_path = '' as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'job not found'; end if;
  return public.service_update_job(p_id, 'cancelled', null, null, 'Cancelled by you', 1);
end $$;

-- Jobs stuck far too long are failed and refunded (called by the worker).
create or replace function public.service_reap_stalled(p_older_than interval default interval '2 hours') returns int
language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  for r in select id from public.generation_jobs where status in ('queued', 'processing') and created_at < now() - p_older_than loop
    perform public.service_update_job(r.id, 'failed', null, null, 'Timed out', 1);
    n := n + 1;
  end loop;
  return n;
end $$;
