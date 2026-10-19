-- Treat a missing client_id as unauthorized for every chat-only archive RPC.
begin;
do $patch$
declare fn regprocedure; definition text;
begin
  foreach fn in array array[
    'public.record_historical_match(uuid,text,text,integer,integer,date,boolean,integer,integer,text)'::regprocedure,
    'public.update_history_baseline(text,integer,integer,integer,boolean)'::regprocedure,
    'public.record_private_archive(text,text,text)'::regprocedure
  ] loop
    select pg_get_functiondef(fn) into definition;
    if position('auth.jwt()->>''client_id''<>''a249d613-9635-4e8d-90a6-42e5fef15a05''' in definition)=0 then
      if position('auth.jwt()->>''client_id'' is distinct from ''a249d613-9635-4e8d-90a6-42e5fef15a05''' in definition)>0 then continue; end if;
      raise exception 'Expected chat client guard missing; stop and review';
    end if;
    definition:=replace(definition,'auth.jwt()->>''client_id''<>''a249d613-9635-4e8d-90a6-42e5fef15a05''','auth.jwt()->>''client_id'' is distinct from ''a249d613-9635-4e8d-90a6-42e5fef15a05''');
    execute definition;
  end loop;
end $patch$;
commit;
