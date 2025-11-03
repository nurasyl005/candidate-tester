-- UUID support (needed for uuid_generate_v4)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- demo table from README (unchanged)
CREATE SEQUENCE IF NOT EXISTS auto_cat1__id;

CREATE TABLE IF NOT EXISTS public.cat1__nomenclature (
  cat1__id int4 DEFAULT nextval('auto_cat1__id'::regclass) NOT NULL,
  cat1__uuid uuid DEFAULT uuid_generate_v4() NOT NULL,
  cat1__insertdate timestamptz DEFAULT now() NOT NULL,
  cat1__updatedate timestamptz DEFAULT now() NOT NULL,
  cat1__deleted bool DEFAULT false NOT NULL,
  cat1__deletedate timestamptz NULL,
  cat1__isfolder bool DEFAULT false NOT NULL,
  cat1_cat1__folder uuid NULL,
  cat1__code text NULL,
  cat1__represent text NOT NULL,
  CONSTRAINT cat1__nomenclature_pkey PRIMARY KEY (cat1__uuid),
  CONSTRAINT cat1__nomenclature_cat1_cat1__folder_fkey
    FOREIGN KEY (cat1_cat1__folder) REFERENCES public.cat1__nomenclature(cat1__uuid)
);

-- “unique but ignore soft-deleted” (allows restoring without conflicts)
CREATE UNIQUE INDEX IF NOT EXISTS cat1__nomenclature_code_uq
ON public.cat1__nomenclature (cat1__code)
WHERE cat1__deleted = false;

-- Demo data
INSERT INTO cat1__nomenclature (cat1__code, cat1__represent) VALUES
('ITEM001','Первый товар'),('ITEM002','Второй товар'),('ITEM003','Третий товар')
ON CONFLICT DO NOTHING;

-- ===== cat2__individuals =====
CREATE SEQUENCE IF NOT EXISTS auto_cat2__id;

CREATE TABLE IF NOT EXISTS public.cat2__individuals (
  cat2__id           int4  DEFAULT nextval('auto_cat2__id'::regclass) NOT NULL,
  cat2__uuid         uuid  DEFAULT uuid_generate_v4()                  NOT NULL,
  cat2__insertdate   timestamptz DEFAULT now()                         NOT NULL,
  cat2__updatedate   timestamptz DEFAULT now()                         NOT NULL,
  cat2__deleted      bool  DEFAULT false                               NOT NULL,
  cat2__deletedate   timestamptz NULL,
  cat2__isfolder     bool  DEFAULT false                               NOT NULL,
  cat2_cat2__folder  uuid  NULL,
  cat2__code         text NULL,
  cat2__represent    text NOT NULL,                    -- ФИО
  cat2__iin          text NOT NULL,                    -- 12 цифр
  cat2__lastname     text NOT NULL,
  cat2__firstname    text NOT NULL,
  cat2__middlename   text NULL,
  CONSTRAINT cat2__individuals_pkey PRIMARY KEY (cat2__uuid),
  CONSTRAINT cat2__individuals_iin_uq UNIQUE (cat2__iin),
  CONSTRAINT cat2__individuals_folder_fkey
     FOREIGN KEY (cat2_cat2__folder) REFERENCES public.cat2__individuals(cat2__uuid)
);

CREATE INDEX IF NOT EXISTS cat2__individuals_deleted_idx ON public.cat2__individuals(cat2__deleted);

-- ===== cat3__staffers =====
CREATE SEQUENCE IF NOT EXISTS auto_cat3__id;

CREATE TABLE IF NOT EXISTS public.cat3__staffers (
  cat3__id           int4  DEFAULT nextval('auto_cat3__id'::regclass) NOT NULL,
  cat3__uuid         uuid  DEFAULT uuid_generate_v4()                  NOT NULL,
  cat3__insertdate   timestamptz DEFAULT now()                         NOT NULL,
  cat3__updatedate   timestamptz DEFAULT now()                         NOT NULL,
  cat3__deleted      bool  DEFAULT false                               NOT NULL,
  cat3__deletedate   timestamptz NULL,
  cat3__isfolder     bool  DEFAULT false                               NOT NULL,
  cat3_cat3__folder  uuid  NULL,
  cat3__code         text NULL,
  cat3__represent    text NOT NULL,                    -- "Табельный: XXX - ФИО"
  cat3__tabno        text NOT NULL,                    -- табельный номер (уник.)
  cat3_cat2__person  uuid NOT NULL,                    -- FK -> individuals
  CONSTRAINT cat3__staffers_pkey PRIMARY KEY (cat3__uuid),
  CONSTRAINT cat3__staffers_tabno_uq UNIQUE (cat3__tabno),
  CONSTRAINT cat3__staffers_person_fkey
     FOREIGN KEY (cat3_cat2__person) REFERENCES public.cat2__individuals(cat2__uuid)
);

CREATE INDEX IF NOT EXISTS cat3__staffers_deleted_idx ON public.cat3__staffers(cat3__deleted);

-- Helpers: auto represent on insert/update
CREATE OR REPLACE FUNCTION cat2__individuals_set_represent()
RETURNS trigger AS $$
BEGIN
  NEW.cat2__represent := trim(coalesce(NEW.cat2__lastname,'') || ' ' ||
                              coalesce(NEW.cat2__firstname,'') || ' ' ||
                              coalesce(NEW.cat2__middlename,''));
  NEW.cat2__updatedate := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cat2__individuals_repr ON public.cat2__individuals;
CREATE TRIGGER trg_cat2__individuals_repr
BEFORE INSERT OR UPDATE ON public.cat2__individuals
FOR EACH ROW EXECUTE FUNCTION cat2__individuals_set_represent();

CREATE OR REPLACE FUNCTION cat3__staffers_set_represent()
RETURNS trigger AS $$
DECLARE fio text;
BEGIN
  SELECT cat2__represent INTO fio FROM public.cat2__individuals
  WHERE cat2__uuid = NEW.cat3_cat2__person;
  NEW.cat3__represent := 'Табельный: ' || NEW.cat3__tabno || ' - ' || coalesce(fio,'');
  NEW.cat3__updatedate := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cat3__staffers_repr ON public.cat3__staffers;
CREATE TRIGGER trg_cat3__staffers_repr
BEFORE INSERT OR UPDATE ON public.cat3__staffers
FOR EACH ROW EXECUTE FUNCTION cat3__staffers_set_represent();
