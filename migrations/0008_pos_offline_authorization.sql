ALTER TABLE cash_sessions ADD COLUMN offline_authorized_until TEXT;

UPDATE cash_sessions
SET offline_authorized_until = strftime(
  '%Y-%m-%dT%H:%M:%fZ',
  opened_at,
  '+60 minutes'
)
WHERE offline_authorized_until IS NULL;
