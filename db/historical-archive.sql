-- Incremental extension for the existing Tavern ledger. Never rerun schema.sql.
begin;

alter table tavern_private.matches
  add column if not exists settles_balance boolean not null default true,
  add column if not exists played_on date,
  add column if not exists was_gamble boolean;
update tavern_private.matches set was_gamble=true where was_gamble is null and stake>0;

-- Add an idempotent administrator-only private archive alongside existing private history.
create table if not exists tavern_private.archive_records(
  id text primary key check(length(id) between 1 and 100),
  label text not null check(length(label) between 1 and 200),
  detail text not null check(length(detail) between 1 and 4000),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
alter table tavern_private.archive_records enable row level security;
revoke all on tavern_private.archive_records from public,anon,authenticated;

create or replace function public.admin_records() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.jwt()->>'client_id' is not null then raise exception '聊天连接不能读取私密档案' using errcode='42501'; end if;
 if not exists(select 1 from tavern_private.admins where user_id=auth.uid()) then raise exception '仅管理员可查看' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (
   select label,detail from tavern_private.legacy_secrets
   union all select a.name||' / '||b.name||' · '||coalesce(m.played_on::text,m.created_at::text), '真实点数：'||coalesce(s.real_a::text,'未记录')||' / '||coalesce(s.real_b::text,'未记录')||'；备注：'||coalesce(s.note,'') from tavern_private.secrets s join tavern_private.matches m on m.id=s.match_id join tavern_private.players a on a.id=m.a join tavern_private.players b on b.id=m.b
   union all select label,detail from tavern_private.archive_records
 ) t;
 return result;
end $$;

create or replace function public.scoreboard() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('players',(select jsonb_agg(to_jsonb(s)) from (
 select p.id,p.name,p.history_complete,
 p.opening_gp+coalesce((select sum(case when m.score_a=m.score_b then 0 when (m.a=p.id and m.score_a>m.score_b) or (m.b=p.id and m.score_b>m.score_a) then m.stake else -m.stake end) from tavern_private.matches m where p.id in(m.a,m.b) and m.settles_balance),0) as net_gp,
 (select max(v) from (select p.opening_max as v union all select case when m.a=p.id then m.score_a else m.score_b end from tavern_private.matches m where p.id in(m.a,m.b)) x) as max_score,
 case when p.opening_appearances is null and not exists(select 1 from tavern_private.matches m where p.id in(m.a,m.b)) then null else coalesce(p.opening_appearances,0)+(select count(*) from tavern_private.matches m where p.id in(m.a,m.b)) end as appearances,
 case when p.opening_gambles is null and not exists(select 1 from tavern_private.matches m where p.id in(m.a,m.b) and m.was_gamble is true) then null else coalesce(p.opening_gambles,0)+(select count(*) from tavern_private.matches m where p.id in(m.a,m.b) and m.was_gamble is true) end as gambles
 from tavern_private.players p) s),
 'matches',coalesce((select jsonb_agg(to_jsonb(t) order by coalesce(t.played_on,t.created_at::date) desc,t.created_at desc,t.id) from (select id,a,b,score_a,score_b,stake,settles_balance,played_on,created_at from tavern_private.matches order by coalesce(played_on,created_at::date) desc,created_at desc,id limit 100) t),'[]'::jsonb),
 'notices',case when exists(select 1 from tavern_private.matches where (a='toby' and b='hector') or (a='hector' and b='toby')) then '[]'::jsonb else jsonb_build_array('托比对赫克托：尚未投骰，不计入已完成场次。') end);
$$;

create or replace function public.record_match(p_request uuid,p_a text,p_b text,p_score_a integer,p_score_b integer,p_stake numeric,p_real_a integer default null,p_real_b integer default null,p_secret text default '') returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'client_id' is not null then
   if auth.jwt()->>'client_id'<>'a249d613-9635-4e8d-90a6-42e5fef15a05' then raise exception '未授权的聊天连接' using errcode='42501'; end if;
   if p_real_a is not null or p_real_b is not null or coalesce(p_secret,'')<>'' then raise exception '聊天连接不能写入普通比赛秘密字段' using errcode='42501'; end if;
 end if;
 if not exists(select 1 from tavern_private.admins where user_id=auth.uid()) then raise exception '仅管理员可录入' using errcode='42501'; end if;
 if p_request is null or p_a is null or p_b is null or p_score_a is null or p_score_b is null or p_stake is null then raise exception '缺少必填字段'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0));
 if exists(select 1 from tavern_private.matches where id=p_request) then
   if exists(select 1 from tavern_private.matches m join tavern_private.secrets s on s.match_id=m.id where m.id=p_request and m.created_by=auth.uid() and m.a=p_a and m.b=p_b and m.score_a=p_score_a and m.score_b=p_score_b and m.stake=p_stake and m.settles_balance and s.real_a is not distinct from p_real_a and s.real_b is not distinct from p_real_b and s.note is not distinct from p_secret) then return p_request; end if;
   raise exception '提交编号已使用，请刷新后重新录入';
 end if;
 insert into tavern_private.matches(id,a,b,score_a,score_b,stake,settles_balance,was_gamble,created_by) values(p_request,p_a,p_b,p_score_a,p_score_b,p_stake,true,case when p_stake>0 then true else null end,auth.uid());
 insert into tavern_private.secrets(match_id,real_a,real_b,note) values(p_request,p_real_a,p_real_b,p_secret);
 return p_request;
end $$;

create or replace function public.record_historical_match(p_request uuid,p_a text,p_b text,p_score_a integer,p_score_b integer,p_played_on date,p_was_gamble boolean default null,p_real_a integer default null,p_real_b integer default null,p_secret text default '') returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'client_id' is distinct from 'a249d613-9635-4e8d-90a6-42e5fef15a05' then raise exception '仅限已授权 Tavern 聊天连接' using errcode='42501'; end if;
 if not exists(select 1 from tavern_private.admins where user_id=auth.uid()) then raise exception '仅管理员可录入' using errcode='42501'; end if;
 if p_request is null or p_a is null or p_b is null or p_a=p_b or p_score_a is null or p_score_b is null or p_played_on is null then raise exception '缺少必填字段'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0));
 if exists(select 1 from tavern_private.matches where id=p_request) then
   if exists(select 1 from tavern_private.matches m join tavern_private.secrets s on s.match_id=m.id where m.id=p_request and m.created_by=auth.uid() and m.a=p_a and m.b=p_b and m.score_a=p_score_a and m.score_b=p_score_b and m.stake=0 and not m.settles_balance and m.played_on=p_played_on and m.was_gamble is not distinct from p_was_gamble and s.real_a is not distinct from p_real_a and s.real_b is not distinct from p_real_b and s.note is not distinct from p_secret) then return p_request; end if;
   raise exception '提交编号已使用，请刷新后重新录入';
 end if;
 insert into tavern_private.matches(id,a,b,score_a,score_b,stake,settles_balance,played_on,was_gamble,created_by) values(p_request,p_a,p_b,p_score_a,p_score_b,0,false,p_played_on,p_was_gamble,auth.uid());
 insert into tavern_private.secrets(match_id,real_a,real_b,note) values(p_request,p_real_a,p_real_b,coalesce(p_secret,''));
 return p_request;
end $$;

create or replace function public.update_history_baseline(p_player text,p_opening_max integer default null,p_opening_appearances integer default null,p_opening_gambles integer default null,p_mark_complete boolean default false) returns text
language plpgsql security definer set search_path='' as $$
declare p tavern_private.players%rowtype;
begin
 if auth.jwt()->>'client_id' is distinct from 'a249d613-9635-4e8d-90a6-42e5fef15a05' then raise exception '仅限已授权 Tavern 聊天连接' using errcode='42501'; end if;
 if not exists(select 1 from tavern_private.admins where user_id=auth.uid()) then raise exception '仅管理员可修改' using errcode='42501'; end if;
 select * into p from tavern_private.players where id=p_player for update;
 if not found then raise exception '选手不存在'; end if;
 if p_opening_max is not null and p.opening_max is not null and p.opening_max<>p_opening_max or p_opening_appearances is not null and p.opening_appearances is not null and p.opening_appearances<>p_opening_appearances or p_opening_gambles is not null and p.opening_gambles is not null and p.opening_gambles<>p_opening_gambles then raise exception '已有统计基线不可覆盖'; end if;
 update tavern_private.players set
   opening_max=coalesce(opening_max,p_opening_max),
   opening_appearances=coalesce(opening_appearances,p_opening_appearances),
   opening_gambles=coalesce(opening_gambles,p_opening_gambles),
   history_complete=history_complete or (p_mark_complete and coalesce(opening_max,p_opening_max) is not null and coalesce(opening_appearances,p_opening_appearances) is not null and coalesce(opening_gambles,p_opening_gambles) is not null and not exists(select 1 from tavern_private.matches m where p_player in(m.a,m.b) and m.was_gamble is null))
 where id=p_player;
 return p_player;
end $$;

create or replace function public.record_private_archive(p_record_id text,p_label text,p_detail text) returns text
language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'client_id' is distinct from 'a249d613-9635-4e8d-90a6-42e5fef15a05' then raise exception '仅限已授权 Tavern 聊天连接' using errcode='42501'; end if;
 if not exists(select 1 from tavern_private.admins where user_id=auth.uid()) then raise exception '仅管理员可录入' using errcode='42501'; end if;
 if p_record_id is null or p_label is null or p_detail is null then raise exception '缺少必填字段'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_record_id,0));
 if exists(select 1 from tavern_private.archive_records where id=p_record_id) then
   if exists(select 1 from tavern_private.archive_records where id=p_record_id and label=p_label and detail=p_detail and created_by=auth.uid()) then return p_record_id; end if;
   raise exception '档案编号已使用，请勿覆盖';
 end if;
 insert into tavern_private.archive_records(id,label,detail,created_by) values(p_record_id,p_label,p_detail,auth.uid());
 return p_record_id;
end $$;

revoke all on function public.record_historical_match(uuid,text,text,integer,integer,date,boolean,integer,integer,text) from public,anon,authenticated;
revoke all on function public.update_history_baseline(text,integer,integer,integer,boolean) from public,anon,authenticated;
revoke all on function public.record_private_archive(text,text,text) from public,anon,authenticated;
revoke all on function public.admin_records() from public,anon,authenticated;
grant execute on function public.record_historical_match(uuid,text,text,integer,integer,date,boolean,integer,integer,text) to authenticated;
grant execute on function public.update_history_baseline(text,integer,integer,integer,boolean) to authenticated;
grant execute on function public.record_private_archive(text,text,text) to authenticated;
grant execute on function public.admin_records() to authenticated;
commit;
