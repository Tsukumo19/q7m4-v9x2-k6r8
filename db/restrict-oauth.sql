-- Incremental hardening only. Never run schema.sql or reimport snapshots.
-- The empty-client guard deliberately denies OAuth writes until client registration.
begin;
do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.admin_records()'::regprocedure) into definition;
  if position('TAVERN_OAUTH_SECRET_GUARD' in definition)=0 then
    if position(E'begin\n' in replace(definition,E'\r',''))=0 then raise exception 'Unexpected function shape'; end if;
    definition:=replace(definition,E'\r','');
    definition:=replace(definition,E'begin\n',E'begin\n -- TAVERN_OAUTH_SECRET_GUARD\n if auth.jwt()->>''client_id'' is not null then raise exception ''聊天连接不能读取秘密'' using errcode=''42501''; end if;\n');
    execute definition;
  end if;
  select pg_get_functiondef('public.record_match(uuid,text,text,integer,integer,numeric,integer,integer,text)'::regprocedure) into definition;
  if position('TAVERN_OAUTH_WRITE_GUARD' in definition)=0 then
    definition:=replace(definition,E'\r','');
    if position(E'begin\n' in definition)=0 then raise exception 'Unexpected function shape'; end if;
    definition:=replace(definition,E'begin\n',E'begin\n -- TAVERN_OAUTH_WRITE_GUARD\n if auth.jwt()->>''client_id'' is not null then raise exception ''聊天连接尚未启用'' using errcode=''42501''; end if;\n');
    execute definition;
  end if;
end $patch$;
commit;

