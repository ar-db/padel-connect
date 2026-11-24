-- Padel Connect: flexible start-time and duration selections.
-- Run ONCE in Supabase SQL Editor after deploying the updated app.js.
-- Start times are selectable every 15 minutes from 17:00 through 22:00;
-- durations are 60 or 90 minutes. Existing broad/fixed slot selections are cleared.

begin;

alter table public.padel_availability
  drop constraint if exists padel_availability_period_check;

delete from public.padel_availability;

alter table public.padel_availability
  add constraint padel_availability_period_check
  check (period ~ '^(60|90)_(17|18|19|20|21|22):(00|15|30|45)$');

create or replace function public.save_padel_availability(p_group_id uuid,p_slots jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_member public.padel_members; v_slot jsonb; v_day int; v_period text; v_club uuid; v_count int:=0;
begin
  select * into v_member from public.padel_members where group_id=p_group_id and user_id=auth.uid();
  if not found then raise exception 'You are not a member of this group'; end if;
  if jsonb_typeof(p_slots) <> 'array' then raise exception 'Availability must be a list'; end if;
  delete from public.padel_availability where group_id=p_group_id and member_id=v_member.id;
  for v_slot in select * from jsonb_array_elements(p_slots) loop
    v_day := (v_slot->>'weekday')::int; v_period := v_slot->>'period'; v_club := nullif(v_slot->>'club_id','')::uuid;
    if v_day not between 0 and 6 or v_period !~ '^(60|90)_(17|18|19|20|21|22):(00|15|30|45)$' then raise exception 'Invalid availability slot'; end if;
    if v_club is not null and not exists(select 1 from public.padel_clubs where id=v_club and group_id=p_group_id) then raise exception 'Invalid club for this group'; end if;
    insert into public.padel_availability(group_id,member_id,weekday,period,club_id) values(p_group_id,v_member.id,v_day,v_period,v_club)
    on conflict do nothing;
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('saved',true,'slots',v_count);
end $$;

commit;
