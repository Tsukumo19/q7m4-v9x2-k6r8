-- Net zero is not evidence that a match had no wager (it may have been a tie).
begin;
update tavern_private.matches set was_gamble=null where settles_balance and stake=0 and was_gamble=false;
do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.record_match(uuid,text,text,integer,integer,numeric,integer,integer,text)'::regprocedure) into definition;
  if position('case when p_stake>0 then true else null end' in definition)>0 then return; end if;
  if position('p_stake>0,auth.uid()' in definition)=0 then raise exception 'Expected record_match insert expression missing; stop and review'; end if;
  definition:=replace(definition,'p_stake>0,auth.uid()','case when p_stake>0 then true else null end,auth.uid()');
  execute definition;
end $patch$;
commit;
