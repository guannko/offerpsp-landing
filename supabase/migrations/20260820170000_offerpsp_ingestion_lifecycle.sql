-- Close an ingestion review automatically once every route in its batch has
-- received a staff decision. The source remains in history as imported.

create or replace function private.finish_offerpsp_ingestion_review()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_catalog
as $$
begin
  if new.status is not distinct from old.status
     or new.status in ('draft', 'review') then
    return new;
  end if;

  update private.offerpsp_ingestion_jobs job
  set status = 'imported',
      reviewed_at = coalesce(job.reviewed_at, now()),
      error_message = null
  where job.batch_id = new.batch_id
    and job.status = 'review'
    and exists (
      select 1
      from private.offerpsp_offer_routes route
      where route.batch_id = new.batch_id
    )
    and not exists (
      select 1
      from private.offerpsp_offer_routes route
      where route.batch_id = new.batch_id
        and route.status in ('draft', 'review')
    );

  return new;
end;
$$;

drop trigger if exists offerpsp_routes_finish_ingestion_review
  on private.offerpsp_offer_routes;
create trigger offerpsp_routes_finish_ingestion_review
after update of status on private.offerpsp_offer_routes
for each row execute function private.finish_offerpsp_ingestion_review();

-- Repair historical rows that were fully reviewed before the lifecycle trigger
-- existed. This includes the completed PAYOK import.
update private.offerpsp_ingestion_jobs job
set status = 'imported',
    reviewed_at = coalesce(job.reviewed_at, now()),
    error_message = null
where job.status = 'review'
  and job.batch_id is not null
  and exists (
    select 1
    from private.offerpsp_offer_routes route
    where route.batch_id = job.batch_id
  )
  and not exists (
    select 1
    from private.offerpsp_offer_routes route
    where route.batch_id = job.batch_id
      and route.status in ('draft', 'review')
  );

revoke all on function private.finish_offerpsp_ingestion_review() from public, anon, authenticated;
grant execute on function private.finish_offerpsp_ingestion_review() to service_role;

comment on function private.finish_offerpsp_ingestion_review() is
  'Moves a reviewed source to imported history when all routes in its batch have a final staff status.';
