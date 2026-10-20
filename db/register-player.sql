-- Incremental extension for the existing Tavern ledger. Never rerun schema.sql.
-- Adds an administrator-only registration RPC and private idempotency receipts.
begin;

create table if not exists tavern_private.player_registration_requests(
  request_id uuid primary key,
  player_id text not null references tavern_private.players(id) on delete restrict,
  player_name text not null,
  opening_gp numeric(12,1) not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
alter table tavern_private.player_registration_requests enable row level security;
revoke all on tavern_private.player_registration_requests from public,anon,authenticated;

create or replace function public.register_player(
  p_request uuid,
  p_player_id text,
  p_name text,
  p_opening_gp numeric
) returns uuid
language plpgsql security definer set search_path='' as $$
declare normalized_name text;
begin
  if auth.jwt()->>'client_id' is distinct from 'a249d613-9635-4e8d-90a6-42e5fef15a05' then
    raise exception '仅限已授权 Tavern 聊天连接' using errcode='42501';
  end if;
  if not exists(select 1 from tavern_private.admins where user_id=auth.uid()) then
    raise exception '仅管理员可新增选手' using errcode='42501';
  end if;
  normalized_name:=pg_catalog.btrim(p_name);
  if p_request is null
     or p_player_id is null or p_player_id !~ '^[a-zA-Z0-9_-]{1,64}$'
     or normalized_name is null or pg_catalog.char_length(normalized_name) not between 1 and 80
     or p_opening_gp is null or p_opening_gp < -1000000 or p_opening_gp > 1000000
     or p_opening_gp*2 <> pg_catalog.trunc(p_opening_gp*2) then
    raise exception '选手资料格式无效';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('player:'||p_player_id,0));
  if exists(select 1 from tavern_private.player_registration_requests r where r.request_id=p_request) then
    if exists(select 1 from tavern_private.player_registration_requests r
      where r.request_id=p_request and r.player_id=p_player_id and r.player_name=normalized_name
        and r.opening_gp=p_opening_gp and r.created_by=auth.uid()) then
      return p_request;
    end if;
    raise exception '注册编号已使用，请沿用原编号和资料重试';
  end if;
  if exists(select 1 from tavern_private.players p where p.id=p_player_id) then
    raise exception '选手 ID 已存在，不能覆盖现有档案';
  end if;

  insert into tavern_private.players(id,name,opening_gp) values(p_player_id,normalized_name,p_opening_gp);
  insert into tavern_private.player_registration_requests(request_id,player_id,player_name,opening_gp,created_by)
    values(p_request,p_player_id,normalized_name,p_opening_gp,auth.uid());
  return p_request;
end
$$;

revoke all on function public.register_player(uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function public.register_player(uuid,text,text,numeric) to authenticated;
commit;

