UPDATE accounts
SET
  username = 'it',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE uid = 'iuO5N7CPJOUTQpvLTO1YHu3ivZ52'
  AND (username IS NULL OR TRIM(username) = '');

UPDATE accounts
SET
  username = 'shahd.zaini',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE uid = '7DMxQMSqKOgtNYYZYRWHMXUH2Bt2'
  AND (username IS NULL OR TRIM(username) = '');

UPDATE accounts
SET
  username = 'hr',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE uid = '7NrTtJOJOuhYoalZQbbOCCPHVoN2'
  AND (username IS NULL OR TRIM(username) = '');

UPDATE accounts
SET
  username = 'info',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE uid = 'oT4KMrmWlKTED9ct8XX3tN4qBFE3'
  AND (username IS NULL OR TRIM(username) = '');