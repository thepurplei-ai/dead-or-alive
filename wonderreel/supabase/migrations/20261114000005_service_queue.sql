-- Moderation queue for the moderate Edge Function (it verifies the moderator role first).
create or replace function public.service_admin_queue() returns table (
  kind text, id uuid, title text, body text, handle text, created_at timestamptz, preview_url text, output_media_id uuid
) language sql stable security definer set search_path = '' as $$
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
$$;
revoke all on function public.service_admin_queue() from public, anon, authenticated;
grant execute on function public.service_admin_queue() to service_role;
