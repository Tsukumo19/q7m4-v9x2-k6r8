-- Narrow the existing OAuth guard to the one registered public PKCE client.
-- Preserves administrator whitelist, UUID locking, and all existing records.
begin;
do $patch$
declare definition text; old_guard text;
begin
  select pg_get_functiondef('public.record_match(uuid,text,text,integer,integer,numeric,integer,integer,text)'::regprocedure) into definition;
  old_guard := 'if auth.jwt()->>''client_id'' is not null then raise exception ''聊天连接尚未启用'' using errcode=''42501''; end if;';
  if position(old_guard in definition)=0 then raise exception 'Expected OAuth guard missing; stop and review'; end if;
  definition := replace(definition,old_guard,$guard$
if auth.jwt()->>'client_id' is not null then
 if auth.jwt()->>'client_id' <> 'a249d613-9635-4e8d-90a6-42e5fef15a05' then
   raise exception '未授权的聊天连接' using errcode='42501';
 end if;
 if p_real_a is not null or p_real_b is not null or coalesce(p_secret,'')<>'' then
   raise exception '聊天连接不能写入秘密字段' using errcode='42501';
 end if;
end if;
$guard$);
  execute definition;
end $patch$;
commit;

