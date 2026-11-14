-- Storage buckets.
-- private-media: user uploads and AI outputs. Path = <owner uuid>/<project>/<file>.
--   Clients upload only through short-lived signed upload URLs issued by the media-upload
--   Edge Function, and read only through signed download URLs issued by media-url.
-- public-media: copies made by a moderator-approved publish. Public read, no client writes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('private-media', 'private-media', false, 104857600,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime']),
  ('public-media', 'public-media', true, 104857600,
   array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Owners may read their own private files directly (signed URLs are still preferred).
create policy private_media_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'private-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Owners may delete their own private files. No direct insert/update policies exist:
-- uploads must use the signed upload URL that the server issues after validation.
create policy private_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'private-media' and (storage.foldername(name))[1] = auth.uid()::text);
