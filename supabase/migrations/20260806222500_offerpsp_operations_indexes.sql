create index if not exists offerpsp_integration_settings_updated_by_idx
  on private.offerpsp_integration_settings(updated_by)
  where updated_by is not null;

create index if not exists offerpsp_telegram_messages_created_by_idx
  on private.offerpsp_telegram_messages(created_by)
  where created_by is not null;
