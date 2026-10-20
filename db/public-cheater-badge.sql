-- Extend the existing ledger with a public badge. No player is marked here.
-- Never rerun db/schema.sql or modify historical matches and balances.
begin;

alter table tavern_private.players
  add column if not exists is_cheater boolean not null default false;

do $patch$
declare definition text;
begin
  select pg_catalog.pg_get_functiondef('public.scoreboard()'::regprocedure) into definition;
  if pg_catalog.strpos(definition,'''is_cheater'',p.is_cheater')>0 then return; end if;
  if pg_catalog.strpos(definition,'''history_complete'',p.history_complete')=0 then
    raise exception 'Expected public scoreboard player shape missing; review before applying';
  end if;
  definition:=pg_catalog.replace(definition,
    '''history_complete'',p.history_complete',
    '''history_complete'',p.history_complete,''is_cheater'',p.is_cheater');
  execute definition;
end $patch$;

create or replace function public.set_player_cheater(p_player_id text,p_is_cheater boolean)
returns text
language plpgsql security definer set search_path='' as $$
begin
  if auth.jwt()->>'client_id' is distinct from 'a249d613-9635-4e8d-90a6-42e5fef15a05' then
    raise exception '仅限已授权 Tavern 聊天连接' using errcode='42501';
  end if;
  if auth.uid() is null or not exists(select 1 from tavern_private.admins where user_id=auth.uid()) then
    raise exception '仅管理员可修改公开标记' using errcode='42501';
  end if;
  if p_player_id is null or p_player_id !~ '^[a-zA-Z0-9_-]{1,64}$' or p_is_cheater is null then
    raise exception '公开标记参数无效';
  end if;
  update tavern_private.players set is_cheater=p_is_cheater where id=p_player_id;
  if not found then raise exception '选手不存在'; end if;
  return p_player_id;
end
$$;

revoke all on function public.set_player_cheater(text,boolean) from public,anon,authenticated;
grant execute on function public.set_player_cheater(text,boolean) to authenticated;
commit;
