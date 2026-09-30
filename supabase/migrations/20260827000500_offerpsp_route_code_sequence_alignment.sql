-- Keep generated OFF-* codes ahead of legacy and migrated route codes.
-- Some historical routes were inserted with explicit codes, which does not
-- advance the backing sequence and can make later imports collide.
select setval(
  'private.offerpsp_route_code_seq',
  greatest(
    coalesce(
      (
        select max((substring(internal_code from '[0-9]+$'))::bigint)
        from private.offerpsp_offer_routes
        where internal_code ~ '^OFF-[0-9]+$'
      ),
      0
    ),
    1
  ),
  true
);
