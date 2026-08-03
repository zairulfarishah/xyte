-- Xyte — mileage rows become multi-stop routes (A -> B -> C -> A).
-- Run once in the Supabase SQL editor, after setup-claims.sql. Safe to re-run.

-- Each stop after the first carries the distance travelled to reach it:
--   [{"name":"Sonicon (Office)"},{"name":"KLCC","km":24},{"name":"Sonicon (Office)","km":24}]
alter table mileage_claim_rows add column if not exists stops jsonb not null default '[]'::jsonb;

-- Superseded by the stops array — the journey total now comes from the legs.
alter table mileage_claim_rows drop column if exists one_way_km;
alter table mileage_claim_rows drop column if exists is_return;
