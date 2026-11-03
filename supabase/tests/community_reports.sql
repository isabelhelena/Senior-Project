-- Run as postgres on a disposable Supabase/PostGIS database after all migrations.
-- All assertions and fixture changes are rolled back.
begin;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAILED: %',label; end if; end;
$$;
update public.community_report_config set submission_secret_hash =
  encode(sha256(convert_to(repeat('test-secret-',4),'UTF8')),'hex') where singleton;
create temp table report_fixture(id uuid, payload jsonb);
insert into report_fixture(payload) values(jsonb_build_object(
  'submissionId',gen_random_uuid(),'category','road_hazard','urgency','severe',
  'description','Floodwater is blocking the right lane near downtown.',
  'longitude',-98.4936,'latitude',29.4241,'sourceClassification',jsonb_build_object('category','road_hazard','urgency','high'),
  'locationSource','gps','locationStatus','ready','flags','[]'::jsonb));

set local role anon;
do $$ begin
  perform public.submit_community_report('wrong-secret',repeat('a',64),'{}'::jsonb);
  raise exception 'Bad secret was accepted';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform * from public.community_reports;
  raise exception 'Anonymous table read was allowed';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform * from public.community_report_config;
  raise exception 'Secret configuration was exposed';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.list_community_report_queue('pending',0);
  raise exception 'Anonymous queue read was allowed';
exception when insufficient_privilege then null; end $$;
reset role;

update report_fixture set id = (public.submit_community_report(repeat('test-secret-',4),repeat('a',64),payload)->>'id')::uuid;
select pg_temp.assert_true((select status='pending' from public.community_reports where id=(select id from report_fixture)), 'submission must be pending');
select pg_temp.assert_true((select public.submit_community_report(repeat('test-secret-',4),repeat('a',64),payload)->>'id'=id::text from report_fixture), 'retry receipt');
select pg_temp.assert_true(not exists(
  select 1 from jsonb_array_elements(public.read_community_reports()->'features') f
  where f->'properties'->>'report_id'=(select id::text from report_fixture)), 'pending report hidden');
select pg_temp.assert_true(not exists(
  select 1 from jsonb_array_elements(public.get_incidents_in_bbox(-99,29,-98,30)::jsonb->'features') f
  where f->'properties'->>'report_id'=(select id::text from report_fixture)), 'legacy RPC hides pending');
do $$ declare p jsonb; begin
  select payload into p from report_fixture;
  perform public.submit_community_report(repeat('test-secret-',4),repeat('a',64),p||jsonb_build_object('description','Changed report with a previously used submission key.'));
  raise exception 'Conflicting retry was accepted';
exception when sqlstate 'PT409' then null; end $$;
do $$ declare p jsonb; begin
  select payload into p from report_fixture;
  perform public.submit_community_report(repeat('test-secret-',4),repeat('b',64),p||jsonb_build_object('longitude',-97.5164,'latitude',35.4676));
  raise exception 'Oklahoma location was accepted';
exception when invalid_parameter_value then null; end $$;
do $$ declare p jsonb; begin
  select payload into p from report_fixture;
  for i in 1..4 loop
    perform public.submit_community_report(repeat('test-secret-',4),repeat('a',64),p||jsonb_build_object('submissionId',gen_random_uuid()));
  end loop;
end $$;
do $$ declare p jsonb; begin
  select payload into p from report_fixture;
  perform public.submit_community_report(repeat('test-secret-',4),repeat('a',64),p||jsonb_build_object('submissionId',gen_random_uuid()));
  raise exception 'Sixth submission was accepted';
exception when sqlstate 'PT429' then null; end $$;
select pg_temp.assert_true((select public.submit_community_report(repeat('test-secret-',4),repeat('a',64),payload)->>'id'=id::text from report_fixture), 'retry after limit');

insert into auth.users(id,email) values ('de1e5510-5ec4-4cce-939d-99032f2e03bb','lss-moderation-fixture@example.invalid');
select set_config('request.jwt.claim.sub','de1e5510-5ec4-4cce-939d-99032f2e03bb',true);
set local role authenticated;
do $$ begin
  perform public.list_community_report_queue('pending',0);
  raise exception 'Non-moderator queue read was allowed';
exception when insufficient_privilege then null; end $$;
reset role;
insert into public.community_report_moderators(user_id) values ('de1e5510-5ec4-4cce-939d-99032f2e03bb');
grant select on report_fixture to authenticated;
set local role authenticated;
select public.list_community_report_queue('pending',0);
select public.moderate_community_report((select id from report_fixture),'approved','pending','Reviewed location and publication suitability.');
do $$ begin
  perform public.moderate_community_report((select id from report_fixture),'rejected','pending','Stale reviewer decision.');
  raise exception 'Stale decision overwrote approval';
exception when sqlstate 'PT409' then null; end $$;
reset role;
select pg_temp.assert_true(exists(select 1 from public.community_report_reviews where report_id=(select id from report_fixture) and status='approved'), 'review audit saved');
select pg_temp.assert_true(exists(
  select 1 from jsonb_array_elements(public.read_community_reports()->'features') f
  where f->'properties'->>'report_id'=(select id::text from report_fixture)
    and not (f->'properties' ?| array['ip_hash','review_notes','reviewed_by','flags'])), 'approved public projection');
set local role authenticated;
select public.moderate_community_report((select id from report_fixture),'rejected','approved','Removed after additional review.');
reset role;
select pg_temp.assert_true(not exists(
  select 1 from jsonb_array_elements(public.read_community_reports()->'features') f
  where f->'properties'->>'report_id'=(select id::text from report_fixture)), 'rejected report hidden');
update public.community_reports set status='approved',expires_at=now()-interval '1 second' where id=(select id from report_fixture);
select pg_temp.assert_true(not exists(
  select 1 from jsonb_array_elements(public.read_community_reports()->'features') f
  where f->'properties'->>'report_id'=(select id::text from report_fixture)), 'expired report hidden');
delete from public.community_report_moderators where user_id='de1e5510-5ec4-4cce-939d-99032f2e03bb';
set local role authenticated;
do $$ begin
  perform public.list_community_report_queue('pending',0);
  raise exception 'Revoked moderator retained access';
exception when insufficient_privilege then null; end $$;
reset role;
rollback;
