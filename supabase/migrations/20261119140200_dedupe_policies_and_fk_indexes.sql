BEGIN;

-- BA Fitness: drop identical duplicate RLS policies, and index foreign keys
-- that have no matching index. Behavior of the remaining policies is unchanged
-- (exact copies only; different USING clauses are left in place).
-- Idempotent.
--
-- ROLLBACK:
--   -- Duplicate policies are not recreated. They were copies, so access rules
--   -- stay the same without them.
--   -- Indexes created here are named ba_fk_<md5>. Remove them with:
--   DO $$
--   DECLARE r record;
--   BEGIN
--     FOR r IN SELECT indexname FROM pg_indexes
--       WHERE schemaname = 'public' AND indexname LIKE 'ba_fk_%'
--     LOOP
--       EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
--     END LOOP;
--   END $$;

DO $$
DECLARE r record;
BEGIN
    FOR r IN
        WITH ranked AS (
            SELECT
                policyname,
                tablename,
                row_number() OVER (
                    PARTITION BY tablename, cmd, permissive, roles, qual, with_check
                    ORDER BY policyname
                ) AS n
            FROM pg_policies
            WHERE schemaname = 'public'
        )
        SELECT policyname, tablename FROM ranked WHERE n > 1
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- One index per foreign key whose columns are not already a leading index prefix.
-- Single and multi-column keys are both covered. Partial indexes are not treated
-- as a cover, because they do not index every referencing row.
DO $$
DECLARE
    r record;
    idxname text;
    col_list text;
BEGIN
    FOR r IN
        SELECT
            con.conname,
            c.relname AS table_name,
            (
                SELECT array_agg(a.attname ORDER BY u.ord)
                FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute a
                  ON a.attrelid = con.conrelid
                 AND a.attnum = u.attnum
            ) AS cols
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'f'
          AND n.nspname = 'public'
          AND NOT EXISTS (
            SELECT 1
            FROM pg_index i
            WHERE i.indrelid = con.conrelid
              AND i.indisvalid
              AND i.indpred IS NULL
              AND (
                SELECT array_agg(k ORDER BY ord)
                FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS u(k, ord)
                WHERE ord <= cardinality(con.conkey)
              ) = con.conkey
          )
    LOOP
        idxname := 'ba_fk_' || md5(r.table_name || ':' || array_to_string(r.cols, ','));
        SELECT string_agg(format('%I', col), ', ')
        INTO col_list
        FROM unnest(r.cols) AS col;
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
            idxname, r.table_name, col_list
        );
    END LOOP;
END $$;

COMMIT;
