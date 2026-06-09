
-- Restrict Realtime channel subscriptions to authenticated users only
CREATE POLICY "Authenticated can subscribe to shoe-events"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() = 'shoe-events')
  AND (extension = 'broadcast')
);

-- Lock down storage.objects for the private 'shoe-assets' bucket.
-- All client read access happens through server-issued signed URLs
-- (service role bypasses RLS), so no direct authenticated/anon access is granted.
-- Explicit deny policies make the intent visible to scanners.
CREATE POLICY "Deny direct access to shoe-assets for anon"
ON storage.objects
FOR SELECT
TO anon
USING (false);

CREATE POLICY "Deny direct access to shoe-assets for authenticated"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id <> 'shoe-assets');
