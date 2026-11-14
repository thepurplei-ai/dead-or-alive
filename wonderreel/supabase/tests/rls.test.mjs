// Row Level Security & business-rule tests against a real Postgres.
// Run: DATABASE_URL=postgres://postgres@localhost:54329/postgres npm test
// The runner creates a fresh database, loads shim.sql (Supabase stand-ins) and all migrations.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const BASE = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:54329/postgres';
const DB = 'wonderreel_test_' + process.pid;
const dir = path.dirname(new URL(import.meta.url).pathname);
let admin, db;

before(async () => {
  admin = new pg.Client({ connectionString: BASE });
  await admin.connect();
  await admin.query(`create database ${DB}`);
  const url = new URL(BASE);
  url.pathname = '/' + DB;
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(fs.readFileSync(path.join(dir, 'shim.sql'), 'utf8'));
  const migDir = path.join(dir, '..', 'migrations');
  for (const f of fs.readdirSync(migDir).sort()) await db.query(fs.readFileSync(path.join(migDir, f), 'utf8'));
});

after(async () => {
  await db?.end();
  await admin?.query(`drop database if exists ${DB}`);
  await admin?.end();
});

/** Run SQL as an API role. who = user id | 'anon' | 'service'. */
async function as(who, sql, params = []) {
  await db.query('begin');
  try {
    if (who === 'service') {
      await db.query(`set local role service_role; select set_config('request.jwt.claim.role','service_role',true)`);
    } else if (who === 'anon') {
      await db.query(`set local role anon; select set_config('request.jwt.claim.role','anon',true)`);
    } else {
      await db.query(`set local role authenticated`);
      await db.query(`select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true)`, [who]);
    }
    const r = await db.query(sql, params);
    await db.query('commit');
    return r.rows;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
const sys = async (sql, params = []) => (await db.query(sql, params)).rows;
const rejects = (p, re) => assert.rejects(p, re);

async function newUser(email, dob = '1990-01-01') {
  const [{ id }] = await sys(`insert into auth.users(email) values ($1) returning id`, [email]);
  if (dob) await as(id, `select public.declare_birth_date($1)`, [dob]);
  return id;
}

let A, B, M, KID, projA, jobA, mediaA, postA;

test('sign-up creates a profile with starter credits; age gate stores only the result', async () => {
  A = await newUser('a@test');
  B = await newUser('b@test');
  M = await newUser('mod@test');
  await sys(`update public.profiles set role='admin', handle='mod' where id=$1`, [M]);
  await sys(`update public.profiles set handle='alice' where id=$1`, [A]);
  await sys(`update public.profiles set handle='bob' where id=$1`, [B]);
  const [p] = await as(A, `select * from public.my_profile()`);
  assert.equal(p.adult_status, 'declared_adult');
  const [{ my_credit_balance }] = await as(A, `select public.my_credit_balance()`);
  assert.equal(my_credit_balance, 10);

  KID = await newUser('kid@test', null);
  const [{ declare_birth_date }] = await as(KID, `select public.declare_birth_date((current_date - interval '15 years')::date)`);
  assert.equal(declare_birth_date, 'underage');
  const [k] = await as(KID, `select * from public.my_profile()`);
  assert.equal(k.status, 'suspended');
  // cannot retry the gate with another date
  const [{ declare_birth_date: again }] = await as(KID, `select public.declare_birth_date('1980-01-01')`);
  assert.equal(again, 'underage');
  const cols = await sys(`select column_name from information_schema.columns where table_name='profiles' and column_name ilike '%birth%'`);
  assert.equal(cols.length, 0, 'no birth date column is stored');
});

test('users cannot promote themselves or read private profile fields of others', async () => {
  await rejects(as(A, `update public.profiles set role='admin' where id=$1`, [A]), /permission denied/);
  await rejects(as(A, `update public.profiles set adult_status='verified_adult' where id=$1`, [A]), /permission denied/);
  await rejects(as(B, `select role from public.profiles where id=$1`, [A]), /permission denied/);
  await as(A, `update public.profiles set bio='hi' where id=$1`, [A]);
  const r = await as(B, `update public.profiles set bio='hacked' where id=$1 returning id`, [A]);
  assert.equal(r.length, 0);
  const [{ bio }] = await sys(`select bio from public.profiles where id=$1`, [A]);
  assert.equal(bio, 'hi');
});

test('Studio projects are private to their owner', async () => {
  [{ id: projA }] = await as(A, `insert into public.projects(title,prompt,storyboard) values ('Hero','Make me a superhero saving a puppy',
    '{"title":"Hero","prompt":"Make me a superhero https://evil.example/x","scenes":[{"title":"One","description":"See https://x.y/face.jpg","camera":"wide","faceUrl":"https://x/face"}]}') returning id`);
  assert.equal((await as(B, `select * from public.projects where id=$1`, [projA])).length, 0);
  assert.equal((await as(B, `update public.projects set title='x' where id=$1 returning id`, [projA])).length, 0);
  assert.equal((await as(B, `delete from public.projects where id=$1 returning id`, [projA])).length, 0);
  await rejects(as('anon', `select * from public.projects`), /permission denied/);
  await rejects(as(B, `insert into public.projects(owner_id,title,prompt) values ($1,'x','y')`, [A]), /permission denied/);
  await rejects(as(A, `update public.projects set owner_id=$1 where id=$2`, [B, projA]), /permission denied/);
  assert.equal((await as(A, `select * from public.projects where id=$1`, [projA])).length, 1);
});

test('clients cannot write trusted tables directly', async () => {
  await rejects(as(A, `insert into public.posts(creator_id,title,status,published_at) values ($1,'x','approved',now())`, [A]), /permission denied/);
  await rejects(as(A, `insert into public.credit_ledger(user_id,delta,kind) values ($1,1000,'grant')`, [A]), /permission denied/);
  await rejects(as(A, `insert into public.generation_jobs(owner_id,project_id,kind,provider,prompt,style,aspect,credits_reserved,idempotency_key)
    values ($1,$2,'text_to_image','x','p','s','a',0,'12345678')`, [A, projA]), /permission denied/);
  await rejects(as(A, `insert into public.media_assets(owner_id,bucket,path,role,kind,mime_type) values ($1,'private-media','x','source','image','image/png')`, [A]), /permission denied/);
  await rejects(as(A, `select public.service_create_job($1,$2,'text_to_image','p','Cinematic','9:16',null,null,'openai','m',1,'key-123456')`, [A, projA]), /permission denied/);
  await rejects(as(A, `update public.feature_flags set enabled=true`), /permission denied/);
});

test('credits: reserve once, idempotent retries, refund once on failure, settle on success', async () => {
  const create = (key, cost = 3) => as('service', `select * from public.service_create_job($1,$2,'text_to_image','A hero over the city','Cinematic','9:16',null,null,'openai','model',$3,$4)`, [A, projA, cost, key]);
  const [j1] = await create('idem-key-1');
  const [j1again] = await create('idem-key-1');
  assert.equal(j1.id, j1again.id);
  let [{ my_credit_balance: bal }] = await as(A, `select public.my_credit_balance()`);
  assert.equal(bal, 7);

  await as('service', `select public.service_update_job($1,'processing','task-1')`, [j1.id]);
  await as('service', `select public.service_update_job($1,'failed',null,null,'provider error')`, [j1.id]);
  await as('service', `select public.service_update_job($1,'failed',null,null,'again')`, [j1.id]);
  [{ my_credit_balance: bal }] = await as(A, `select public.my_credit_balance()`);
  assert.equal(bal, 10, 'refunded exactly once');

  [jobA] = await create('idem-key-2', 1);
  // B cannot see A's job
  assert.equal((await as(B, `select * from public.generation_jobs where id=$1`, [jobA.id])).length, 0);
  await rejects(as(B, `select public.cancel_job($1)`, [jobA.id]), /job not found/);

  const claimed = await as('service', `select * from public.service_claim_jobs(5, 60)`);
  assert.ok(claimed.some((j) => j.id === jobA.id));
  const claimedAgain = await as('service', `select * from public.service_claim_jobs(5, 60)`);
  assert.ok(!claimedAgain.some((j) => j.id === jobA.id), 'leased job is not handed out twice');

  [{ id: mediaA }] = await sys(`insert into public.media_assets(owner_id,project_id,bucket,path,role,kind,mime_type,status)
    values ($1,$2,'private-media',$3,'output','image','image/png','ready') returning id`, [A, projA, A + '/out/1.png']);
  await as('service', `select public.service_update_job($1,'processing','task-2')`, [jobA.id]);
  await as('service', `select public.service_update_job($1,'completed',null,$2)`, [jobA.id, mediaA]);
  await as('service', `select public.service_update_job($1,'failed')`, [jobA.id]); // illegal after completion: ignored
  const [done] = await sys(`select status from public.generation_jobs where id=$1`, [jobA.id]);
  assert.equal(done.status, 'completed');
  [{ my_credit_balance: bal }] = await as(A, `select public.my_credit_balance()`);
  assert.equal(bal, 9);

  await rejects(create('idem-key-3', 500), /not enough credits/);
});

test('concurrency cap and kill switch', async () => {
  const mk = (k) => as('service', `select * from public.service_create_job($1,$2,'text_to_image','A hero over the city','Cinematic','9:16',null,null,'openai','m',1,$3)`, [A, projA, k]);
  const [x] = await mk('cap-key-1');
  const [y] = await mk('cap-key-2');
  await rejects(mk('cap-key-3'), /two renders are already running/);
  await as('service', `select public.service_update_job($1,'cancelled')`, [x.id]);
  await as(A, `select public.cancel_job($1)`, [y.id]);
  await as(M, `select public.admin_set_flag('generation_enabled', false)`);
  await rejects(mk('cap-key-4'), /generation is paused/);
  await as(M, `select public.admin_set_flag('generation_enabled', true)`);
});

test('Family Mode and minors never reach cloud AI or the public feed', async () => {
  const [{ id: fam }] = await as(A, `insert into public.projects(title,prompt,is_family) values ('Bedtime','A sleepy moonlit boat trip',true) returning id`);
  await rejects(as('service', `select public.service_create_job($1,$2,'text_to_image','A sleepy moonlit trip','Animated','9:16',null,null,'openai','m',1,'fam-key-1')`, [A, fam]), /disabled for Family Mode/);
  await rejects(as(M, `select public.admin_set_flag('family_cloud_enabled', true)`), /locked off/);
  await rejects(as(A, `select public.admin_set_flag('generation_enabled', false)`), /admins only/);
  await rejects(as(A, `select public.request_publish($1,'x',false,'{}')`, [fam]), /never be published|render a result/);

  const [{ id: minorMedia }] = await sys(`insert into public.media_assets(owner_id,project_id,bucket,path,role,kind,mime_type,status,contains_minor)
    values ($1,$2,'private-media',$3,'source','image','image/jpeg','ready',true) returning id`, [A, projA, A + '/src/kid.jpg']);
  await rejects(as('service', `select public.service_create_job($1,$2,'image_edit','Turn this into a hero','Cinematic','9:16',null,$3,'openai','m',1,'minor-key-1')`, [A, projA, minorMedia]), /minors/);
  // B's media cannot be used by A
  const [{ id: bProj }] = await as(B, `insert into public.projects(title,prompt) values ('B','B project prompt here') returning id`);
  const [{ id: bMedia }] = await sys(`insert into public.media_assets(owner_id,project_id,bucket,path,role,kind,mime_type,status)
    values ($1,$2,'private-media',$3,'source','image','image/jpeg','ready') returning id`, [B, bProj, B + '/src/b.jpg']);
  await rejects(as('service', `select public.service_create_job($1,$2,'image_edit','Turn this into a hero','Cinematic','9:16',null,$3,'openai','m',1,'steal-key-1')`, [A, projA, bMedia]), /source media not found/);
  // underage account cannot generate or publish
  await rejects(as('service', `select public.service_create_job($1,$2,'text_to_image','x is a long prompt','Cinematic','9:16',null,null,'openai','m',1,'kid-key-1')`, [KID, projA]), /adult accounts/);
});

test('publishing is moderated: pending posts are invisible until approved with a public copy', async () => {
  await as(A, `select public.start_remix($1, $1)`, [projA]).catch(() => {}); // nonsense call must not break anything
  [{ request_publish: postA }] = await as(A, `select public.request_publish($1,'My hero #superhero #Fun',true,'{superhero,fun,"bad tag!"}')`, [projA]);
  await rejects(as(A, `select public.request_publish($1,'again',true,'{}')`, [projA]), /already published/);
  const [mine] = await as(A, `select status, template, tags from public.posts where id=$1`, [postA]);
  assert.equal(mine.status, 'pending_review');
  assert.deepEqual(mine.tags.sort(), ['fun', 'superhero']);
  const tpl = JSON.stringify(mine.template);
  assert.doesNotMatch(tpl, /https?:\/\//, 'template has no URLs');
  assert.doesNotMatch(tpl, /faceUrl/, 'template keeps only story fields');

  assert.equal((await as(B, `select * from public.posts where id=$1`, [postA])).length, 0);
  assert.equal((await as('anon', `select * from public.posts where id=$1`, [postA])).length, 0);
  assert.equal((await as('anon', `select * from public.feed()`)).length, 0);
  await rejects(as(A, `update public.posts set status='approved', published_at=now() where id=$1`, [postA]), /permission denied/);
  await rejects(as(B, `select * from public.admin_queue()`), /moderators only/);
  await rejects(as(B, `select public.admin_decide('post',$1,'approve','')`, [postA]), /moderators only/);

  const queue = await as(M, `select * from public.admin_queue()`);
  assert.ok(queue.some((q) => q.kind === 'post' && q.id === postA));
  await rejects(as(M, `select public.admin_decide('post',$1,'approve','')`, [postA]), /public media copy/);
  await sys(`update public.posts set video_path=$2 where id=$1`, [postA, `posts/${postA}.mp4`]);
  await as(M, `select public.admin_decide('post',$1,'approve','looks good')`, [postA]);

  const feed = await as('anon', `select * from public.feed()`);
  assert.equal(feed.length, 1);
  assert.equal(feed[0].handle, 'alice');
  assert.ok(feed[0].template, 'remixable post exposes its template');
  const audit = await as(M, `select action from public.audit_logs where target_id=$1`, [postA]);
  assert.ok(audit.some((a) => a.action === 'post:approve'));
  assert.equal((await as(A, `select * from public.audit_logs`)).length, 0, 'non-moderators see no audit logs');
});

test('likes, comments (moderated), follows', async () => {
  await as(B, `insert into public.likes(post_id,user_id) values ($1,$2)`, [postA, B]);
  await rejects(as(B, `insert into public.likes(post_id,user_id) values ($1,$2)`, [postA, A]), /row-level security/);
  let [{ like_count }] = await sys(`select like_count from public.posts where id=$1`, [postA]);
  assert.equal(like_count, 1);

  const [{ id: c1 }] = await as(B, `insert into public.comments(post_id,author_id,body) values ($1,$2,'Amazing!') returning id`, [postA, B]);
  await rejects(as(B, `insert into public.comments(post_id,author_id,body,moderation_status) values ($1,$2,'x','approved')`, [postA, B]), /permission denied/);
  assert.equal((await as('anon', `select * from public.comments where id=$1`, [c1])).length, 0, 'pending comment hidden');
  assert.equal((await as(B, `select * from public.comments where id=$1`, [c1])).length, 1, 'author sees own pending comment');
  await as(M, `select public.admin_decide('comment',$1,'approve','')`, [c1]);
  assert.equal((await as('anon', `select * from public.comments where id=$1`, [c1])).length, 1);

  await as(B, `insert into public.follows(follower_id,following_id) values ($1,$2)`, [B, A]);
  const following = await as(B, `select * from public.feed('following')`);
  assert.equal(following.length, 1);
  assert.equal((await as(A, `select * from public.feed('following')`)).length, 0);
  await rejects(as(KID, `insert into public.follows(follower_id,following_id) values ($1,$2)`, [KID, A]), /row-level security/);
});

test('Create My Version: only story data, respects opt-out and keeps lineage', async () => {
  const [{ id: projB }] = await as(B, `insert into public.projects(title,prompt) values ('My hero','Me as a superhero saving a puppy') returning id`);
  const [{ start_remix: tpl }] = await as(B, `select public.start_remix($1,$2)`, [projB, postA]);
  assert.ok(Array.isArray(tpl.scenes));
  assert.doesNotMatch(JSON.stringify(tpl), /https?:\/\/|private-media|\.png|\.mp4/);
  const [proj] = await as(B, `select remix_of_post from public.projects where id=$1`, [projB]);
  assert.equal(proj.remix_of_post, postA);
  // B's remix result gets published with lineage
  const [{ id: outB }] = await sys(`insert into public.media_assets(owner_id,project_id,bucket,path,role,kind,mime_type,status)
    values ($1,$2,'private-media',$3,'output','image','image/png','ready') returning id`, [B, projB, B + '/out/b.png']);
  const [jb] = await as('service', `select * from public.service_create_job($1,$2,'text_to_image','Me as a superhero','Cinematic','9:16',null,null,'openai','m',1,'remix-key-1')`, [B, projB]);
  await as('service', `select public.service_update_job($1,'processing','t')`, [jb.id]);
  await as('service', `select public.service_update_job($1,'completed',null,$2)`, [jb.id, outB]);
  const [{ request_publish: postB }] = await as(B, `select public.request_publish($1,'my version',false,'{}')`, [projB]);
  const [pb] = await sys(`select remix_of_post from public.posts where id=$1`, [postB]);
  assert.equal(pb.remix_of_post, postA);
  await sys(`update public.posts set video_path='posts/b.mp4' where id=$1`, [postB]);
  await as(M, `select public.admin_decide('post',$1,'approve','')`, [postB]);
  const feed = await as('anon', `select * from public.feed()`);
  const fb = feed.find((f) => f.id === postB);
  assert.equal(fb.remixed_from_handle, 'alice');
  assert.equal(fb.template, null, 'B did not allow remixes, so no template is exposed');

  // A turns remixing off: new remixes are refused
  await as(A, `update public.posts set allow_remix=false where id=$1`, [postA]);
  const [{ id: projB2 }] = await as(B, `insert into public.projects(title,prompt) values ('Again','Another superhero attempt') returning id`);
  await rejects(as(B, `select public.start_remix($1,$2)`, [projB2, postA]), /not allowed remixes/);
  await as(A, `update public.posts set allow_remix=true where id=$1`, [postA]);
});

test('blocking hides content both ways and stops interactions', async () => {
  await as(B, `insert into public.blocks(blocker_id,blocked_id) values ($1,$2)`, [B, A]);
  assert.equal((await as(B, `select * from public.feed() where creator_id=$1`, [A])).length, 0);
  assert.equal((await as(A, `select * from public.feed() where creator_id=$1`, [B])).length, 0, 'blocked user also cannot see blocker');
  assert.equal((await as(B, `select * from public.follows where follower_id=$1 and following_id=$2`, [B, A])).length, 0, 'follow removed');
  await as(B, `delete from public.likes where post_id=$1 and user_id=$2`, [postA, B]);
  await rejects(as(B, `insert into public.likes(post_id,user_id) values ($1,$2)`, [postA, B]), /row-level security/);
  const [{ id: projB3 }] = await as(B, `insert into public.projects(title,prompt) values ('Blocked','Trying to remix a blocked creator') returning id`);
  await rejects(as(B, `select public.start_remix($1,$2)`, [projB3, postA]), /not available/);
  await as(B, `delete from public.blocks where blocker_id=$1 and blocked_id=$2`, [B, A]);
  assert.equal((await as(B, `select * from public.feed() where creator_id=$1`, [A])).length, 1);
});

test('reports lead to takedown; takedown removes post from the feed', async () => {
  await as(B, `insert into public.reports(reporter_id,post_id,reason,details) values ($1,$2,'likeness','That is my face')`, [B, postA]);
  await rejects(as(B, `insert into public.reports(reporter_id,post_id,reason) values ($1,$2,'spam')`, [B, postA]), /duplicate key/);
  assert.equal((await as(A, `select * from public.reports`)).length, 0, 'creator cannot see who reported');
  const q = await as(M, `select * from public.admin_queue() where kind='report'`);
  assert.equal(q.length, 1);
  await as(M, `select public.admin_decide('report',$1,'takedown','confirmed likeness')`, [q[0].id]);
  assert.equal((await as('anon', `select * from public.feed() where id=$1`, [postA])).length, 0);
  const [n] = await as(A, `select kind from public.notifications order by id desc limit 1`);
  assert.ok(n);
});

test('storage: private files are owner-only', async () => {
  await sys(`insert into storage.objects(bucket_id,name) values ('private-media', $1), ('private-media', $2)`, [A + '/p/1.jpg', B + '/p/2.jpg']);
  const aSees = await as(A, `select name from storage.objects`);
  assert.equal(aSees.length, 1);
  assert.ok(aSees[0].name.startsWith(A));
  await rejects(as(A, `insert into storage.objects(bucket_id,name) values ('private-media', $1)`, [A + '/x.jpg']), /row-level security/);
  assert.equal((await as(A, `delete from storage.objects where name like $1 returning name`, [B + '%'])).length, 0);
  const [bucket] = await sys(`select public from storage.buckets where id='private-media'`);
  assert.equal(bucket.public, false);
});

test('rate limits stop comment spam', async () => {
  const [{ id: C }] = await sys(`insert into auth.users(email) values ('spam@test') returning id`);
  await as(C, `select public.declare_birth_date('1985-05-05')`);
  for (let i = 0; i < 20; i++) await as(C, `insert into public.comments(post_id,author_id,body) values ($1,$2,'hi')`, [postA, C]).catch(() => {});
  await rejects(as(C, `insert into public.comments(post_id,author_id,body) values ($1,$2,'hi')`, [postA, C]), /rate_limited|row-level/);
});

test('account deletion cascades private data', async () => {
  const [{ id: D }] = await sys(`insert into auth.users(email) values ('d@test') returning id`);
  await as(D, `select public.declare_birth_date('1980-01-01')`);
  await as(D, `insert into public.projects(title,prompt) values ('Gone','This will be deleted soon')`);
  await sys(`delete from auth.users where id=$1`, [D]);
  for (const t of ['profiles', 'projects', 'credit_ledger']) {
    const col = t === 'profiles' ? 'id' : t === 'projects' ? 'owner_id' : 'user_id';
    assert.equal((await sys(`select 1 from public.${t} where ${col}=$1`, [D])).length, 0, t);
  }
});
