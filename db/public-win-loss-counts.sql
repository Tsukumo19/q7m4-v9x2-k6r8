-- Public win/loss totals from announced scores in all recorded matches.
-- This only extends the existing scoreboard function; no ledger rows change.
begin;
do $patch$
declare definition text;
begin
  select pg_catalog.pg_get_functiondef('public.scoreboard()'::regprocedure) into definition;
  if pg_catalog.strpos(definition,'''wins'',')>0 then return; end if;
  if pg_catalog.strpos(definition,'''gambles'',p.opening_gambles')=0 then
    raise exception 'Expected scoreboard player shape missing; review before applying';
  end if;
  definition:=pg_catalog.replace(definition,
    '''gambles'',p.opening_gambles',
    '''gambles'',p.opening_gambles,' ||
    '''wins'',(select count(*) from tavern_private.matches m where ' ||
      '(m.a=p.id and m.score_a>m.score_b) or (m.b=p.id and m.score_b>m.score_a)),' ||
    '''losses'',(select count(*) from tavern_private.matches m where ' ||
      '(m.a=p.id and m.score_a<m.score_b) or (m.b=p.id and m.score_b<m.score_a))');
  execute definition;
end $patch$;
commit;
