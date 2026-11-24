-- Padel Connect: replace broad time-of-day periods with 10 evening booking slots.
-- Run this ONCE in Supabase SQL Editor for an existing installation.
-- Existing availability selections are cleared because Morning/Afternoon/etc.
-- cannot be translated reliably into these exact start-time/duration choices.

begin;

alter table public.padel_availability
  drop constraint if exists padel_availability_period_check;

delete from public.padel_availability;

alter table public.padel_availability
  add constraint padel_availability_period_check
  check (period in ('90_17','60_17','90_18','60_18','90_19','60_19','90_20','60_20','90_21','60_21'));

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
    if v_day not between 0 and 6 or v_period not in ('90_17','60_17','90_18','60_18','90_19','60_19','90_20','60_20','90_21','60_21') then raise exception 'Invalid availability slot'; end if;
    if v_club is not null and not exists(select 1 from public.padel_clubs where id=v_club and group_id=p_group_id) then raise exception 'Invalid club for this group'; end if;
    insert into public.padel_availability(group_id,member_id,weekday,period,club_id) values(p_group_id,v_member.id,v_day,v_period,v_club)
    on conflict do nothing;
    v_count:=v_count+1;
  end loop;
  return jsonb_build_object('saved',true,'slots',v_count);
end $$;

commit;
