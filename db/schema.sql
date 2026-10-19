-- Run once in the Supabase SQL editor. No secrets or service keys in this file.
begin;
create schema if not exists tavern_private;
revoke all on schema tavern_private from public, anon, authenticated;
create table tavern_private.admins(user_id uuid primary key references auth.users(id));
create table tavern_private.players(
 id text primary key, name text not null,
 opening_gp numeric(12,1) not null, opening_max integer,
 opening_appearances integer check(opening_appearances>=0),
 opening_gambles integer check(opening_gambles>=0),
 history_complete boolean not null default false
);
create table tavern_private.matches(
 id uuid primary key, a text not null references tavern_private.players(id), b text not null references tavern_private.players(id),
 score_a integer not null check(score_a between 0 and 1000000), score_b integer not null check(score_b between 0 and 1000000),
 stake numeric not null check(stake between 0 and 1000000 and stake*2=trunc(stake*2)),
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id), check(a<>b)
);
create table tavern_private.secrets(
 match_id uuid primary key references tavern_private.matches(id),
 real_a integer check(real_a between 0 and 1000000), real_b integer check(real_b between 0 and 1000000), note text check(length(note)<=2000)
);
create table tavern_private.legacy_secrets(id text primary key, label text not null, detail text not null);
alter table tavern_private.admins enable row level security;
alter table tavern_private.players enable row level security;
alter table tavern_private.matches enable row level security;
alter table tavern_private.secrets enable row level security;
alter table tavern_private.legacy_secrets enable row level security;
revoke all on all tables in schema tavern_private from public, anon, authenticated;
insert into tavern_private.players(id,name,opening_gp,opening_max) values
('griggo','格里戈',13,60),('bernardo','贝尔纳多',3,null),('elias','埃利亚斯',-.5,null),('isabel','伊莎贝尔',-2,null),('hector','赫克托',-2,null),('rosa','罗莎',-2.5,null),('toby','托比',-4,null),('martin','马丁',-5,null);

create function public.scoreboard() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('players',(select jsonb_agg(to_jsonb(s)) from (
 select p.id,p.name,p.history_complete,
 p.opening_gp+coalesce((select sum(case when m.score_a=m.score_b then 0 when (m.a=p.id and m.score_a>m.score_b) or (m.b=p.id and m.score_b>m.score_a) then m.stake else -m.stake end) from tavern_private.matches m where p.id in(m.a,m.b)),0) as net_gp,
 (select max(v) from (select p.opening_max as v union all select case when m.a=p.id then m.score_a else m.score_b end from tavern_private.matches m where p.id in(m.a,m.b)) x) as max_score,
 case when p.opening_appearances is null and not exists(select 1 from tavern_private.matches m where p.id in(m.a,m.b)) then null else coalesce(p.opening_appearances,0)+(select count(*) from tavern_private.matches m where p.id in(m.a,m.b)) end as appearances,
 case when p.opening_gambles is null and not exists(select 1 from tavern_private.matches m where p.id in(m.a,m.b) and m.stake>0) then null else coalesce(p.opening_gambles,0)+(select count(*) from tavern_private.matches m where p.id in(m.a,m.b) and m.stake>0) end as gambles
 from tavern_private.players p) s),
 'matches',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id) from (select id,a,b,score_a,score_b,stake,created_at from tavern_private.matches order by created_at desc,id limit 100) t),'[]'::jsonb),
 'notices',case when exists(select 1 from tavern_private.matches where (a='toby' and b='hector') or (a='hector' and b='toby')) then '[]'::jsonb else jsonb_build_array('托比对赫克托：尚未投骰，不计入已完成场次。') end);
$$;
create function public.record_match(p_request uuid,p_a text,p_b text,p_score_a integer,p_score_b integer,p_stake numeric,p_real_a integer default null,p_real_b integer default null,p_secret text default '') returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from tavern_private.admins where user_id=auth.uid()) then raise exception '仅管理员可录入' using errcode='42501'; end if;
 if p_request is null or p_a is null or p_b is null or p_score_a is null or p_score_b is null or p_stake is null then raise exception '缺少必填字段'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0));
 if exists(select 1 from tavern_private.matches where id=p_request) then
   if exists(select 1 from tavern_private.matches m join tavern_private.secrets s on s.match_id=m.id where m.id=p_request and m.created_by=auth.uid() and m.a=p_a and m.b=p_b and m.score_a=p_score_a and m.score_b=p_score_b and m.stake=p_stake and s.real_a is not distinct from p_real_a and s.real_b is not distinct from p_real_b and s.note is not distinct from p_secret) then return p_request; end if;
   raise exception '提交编号已使用，请刷新后重新录入';
 end if;
 insert into tavern_private.matches(id,a,b,score_a,score_b,stake,created_by) values(p_request,p_a,p_b,p_score_a,p_score_b,p_stake,auth.uid());
 insert into tavern_private.secrets(match_id,real_a,real_b,note) values(p_request,p_real_a,p_real_b,p_secret);
 return p_request;
end $$;
create function public.admin_records() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from tavern_private.admins where user_id=auth.uid()) then raise exception '仅管理员可查看' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (
 select label,detail from tavern_private.legacy_secrets
 union all select a.name||' / '||b.name||' · '||m.created_at::text, '真实点数：'||coalesce(s.real_a::text,'未记录')||' / '||coalesce(s.real_b::text,'未记录')||'；备注：'||coalesce(s.note,'') from tavern_private.secrets s join tavern_private.matches m on m.id=s.match_id join tavern_private.players a on a.id=m.a join tavern_private.players b on b.id=m.b
 ) t;
 return result;
end $$;
revoke all on function public.scoreboard() from public,anon,authenticated;
revoke all on function public.record_match(uuid,text,text,integer,integer,numeric,integer,integer,text) from public,anon,authenticated;
revoke all on function public.admin_records() from public,anon,authenticated;
grant execute on function public.scoreboard() to anon,authenticated;
grant execute on function public.record_match(uuid,text,text,integer,integer,numeric,integer,integer,text) to authenticated;
grant execute on function public.admin_records() to authenticated;
commit;
