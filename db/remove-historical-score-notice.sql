-- Remove the historical-score notice from the public scoreboard response.
-- This is an incremental function update; do not rerun schema.sql.
create or replace function public.scoreboard() returns jsonb
language sql stable security definer set search_path='' as $$
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

