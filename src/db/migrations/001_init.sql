-- Catraca full schema (F01). Later features add new numbered migrations, never edit this one.

CREATE TABLE users (
  id            text PRIMARY KEY,
  name          text NOT NULL CHECK (length(trim(name)) > 0),
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('participant', 'organizer')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE sessions (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE partners (
  id           text PRIMARY KEY,
  name         text NOT NULL UNIQUE,
  api_key_hash text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id           text PRIMARY KEY,
  organizer_id text NOT NULL REFERENCES users (id),
  name         text NOT NULL,
  starts_at    timestamptz NOT NULL,
  venue        text NOT NULL,
  capacity     integer NOT NULL CHECK (capacity >= 1),
  price_cents  integer NOT NULL CHECK (price_cents > 0),
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  cancelled_at timestamptz
);
CREATE INDEX events_status_idx ON events (status, starts_at);
CREATE INDEX events_organizer_idx ON events (organizer_id);

CREATE TABLE tickets (
  id            text PRIMARY KEY,
  event_id      text NOT NULL REFERENCES events (id),
  code          text NOT NULL UNIQUE,
  status        text NOT NULL CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'refunded')),
  checked_in    boolean NOT NULL DEFAULT false,
  checked_in_at timestamptz,
  price_cents   integer NOT NULL CHECK (price_cents > 0),
  channel       text NOT NULL CHECK (channel IN ('web', 'partner')),
  buyer_user_id text REFERENCES users (id),
  buyer_email   text NOT NULL,
  partner_id    text REFERENCES partners (id),
  card_last4    text NOT NULL CHECK (card_last4 ~ '^[0-9]{4}$'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_event_status_idx ON tickets (event_id, status);
CREATE INDEX tickets_buyer_idx ON tickets (buyer_user_id, created_at DESC);

CREATE TABLE payment_jobs (
  id           text PRIMARY KEY,
  ticket_id    text NOT NULL UNIQUE REFERENCES tickets (id),
  card_last4   text NOT NULL,
  decision     text NOT NULL CHECK (decision IN ('approved', 'declined')),
  due_at       timestamptz NOT NULL,
  state        text NOT NULL DEFAULT 'scheduled' CHECK (state IN ('scheduled', 'done', 'obsolete')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX payment_jobs_due_idx ON payment_jobs (state, due_at);

-- Defense in depth for R07: occupied seats (pending + confirmed) can never exceed capacity.
-- The normal path (SELECT ... FOR UPDATE on the event row) never trips this trigger;
-- it exists to turn a forgotten lock into an error instead of an oversold event.
CREATE FUNCTION tickets_capacity_guard() RETURNS trigger AS $$
DECLARE
  cap integer;
  occupied integer;
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('pending', 'confirmed') THEN
    RETURN NEW; -- pending -> confirmed does not change occupancy
  END IF;
  SELECT capacity INTO cap FROM events WHERE id = NEW.event_id;
  SELECT count(*) INTO occupied FROM tickets
   WHERE event_id = NEW.event_id AND status IN ('pending', 'confirmed') AND id <> NEW.id;
  IF occupied + 1 > cap THEN
    RAISE EXCEPTION 'capacity exceeded for event % (capacity %, occupied %)', NEW.event_id, cap, occupied
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_capacity_guard
  BEFORE INSERT OR UPDATE OF status ON tickets
  FOR EACH ROW EXECUTE FUNCTION tickets_capacity_guard();
