-- 1. Application settings (controls whether the one-time code step is enforced)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_settings (key, value)
VALUES ('otp_required', 'false')
ON CONFLICT (key) DO NOTHING;

-- 2. One-time code challenges (hash only, single use, expiring)
CREATE TABLE IF NOT EXISTS public.auth_otp_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  device_hash text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.auth_otp_challenge TO service_role;
ALTER TABLE public.auth_otp_challenge ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS auth_otp_one_pending
  ON public.auth_otp_challenge (user_id, device_hash)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_otp_expires ON public.auth_otp_challenge (expires_at);

-- 3. Trusted devices (skip the code on a known browser)
CREATE TABLE IF NOT EXISTS public.auth_trusted_device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_hash text NOT NULL,
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (user_id, device_hash)
);
GRANT ALL ON public.auth_trusted_device TO service_role;
ALTER TABLE public.auth_trusted_device ENABLE ROW LEVEL SECURITY;

-- 4. Sessions that have passed the code step
CREATE TABLE IF NOT EXISTS public.auth_verified_session (
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  device_hash text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, session_id)
);
GRANT ALL ON public.auth_verified_session TO service_role;
ALTER TABLE public.auth_verified_session ENABLE ROW LEVEL SECURITY;

-- 5. Enforcement helpers
CREATE OR REPLACE FUNCTION public.otp_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT value = 'true' FROM public.app_settings WHERE key = 'otp_required'), false);
$$;

CREATE OR REPLACE FUNCTION public.session_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT public.otp_required()
      OR EXISTS (
        SELECT 1 FROM public.auth_verified_session v
         WHERE v.user_id = auth.uid()
           AND v.session_id = COALESCE(auth.jwt() ->> 'session_id', '')
           AND v.expires_at > now()
      );
$$;

CREATE OR REPLACE FUNCTION public.is_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.session_verified()
     AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid())
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.session_verified()
     AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin')
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active);
$$;

-- 6. Stored quantity for master ingredients (additive, existing rows keep per-100 g basis)
ALTER TABLE public.master_items
  ADD COLUMN IF NOT EXISTS quantity_g numeric NOT NULL DEFAULT 100;
