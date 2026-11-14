-- Run ONCE in the Supabase SQL editor after deploying the functions (not a migration,
-- because it contains your project URL and worker secret). Requires the pg_cron and
-- pg_net extensions (Database → Extensions).
-- Replace <PROJECT_REF> and <WORKER_SECRET> (the same value you set with
-- `supabase secrets set WORKER_SECRET=...`).
select cron.schedule('wonderreel-jobs-worker', '* * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/jobs-worker',
    headers := jsonb_build_object('content-type', 'application/json', 'x-worker-secret', '<WORKER_SECRET>'),
    body := '{}'::jsonb
  );
$$);
-- Clean old rate-limit rows daily.
select cron.schedule('wonderreel-rate-cleanup', '17 3 * * *', $$
  delete from app_private.rate_events where at < now() - interval '2 days';
$$);
