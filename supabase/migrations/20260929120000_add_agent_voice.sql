alter table public.agents add column if not exists voice_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agents_voice_id_check') then
    alter table public.agents add constraint agents_voice_id_check check (
      voice_id is null or voice_id in (
        'alba','eve','george','jane','jean','mary','michael',
        'anna','charles','paul','vera','giovanni','lola','juergen','rafael','estelle'
      )
    );
  end if;
end $$;
comment on column public.agents.voice_id is 'AssemblyAI voice for future sessions; NULL defaults to Alba.';
