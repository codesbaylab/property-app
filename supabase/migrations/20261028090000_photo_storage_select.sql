-- Fix: owners could not actually delete their photos.
-- Supabase Storage looks a file up (under row level security) before it deletes or lists it, and 20261026090000_posting.sql
-- only gave owners INSERT, UPDATE and DELETE. Without a SELECT rule the delete call reports success but removes nothing,
-- so deleting a photo or a listing left the files behind.
-- This lets a signed-in person see (and so list and delete) files in their own folder only. Photos stay publicly viewable
-- by their direct link because the bucket is public; this does not let anyone browse other people's folders.
create policy listing_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
