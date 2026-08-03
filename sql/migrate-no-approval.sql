-- Xyte — mileage claims no longer carry an approval workflow.
-- The module now just compiles journeys and generates a PDF, which is signed by hand.
-- Run once on a database created before this change. Safe to re-run.

alter table mileage_claims
  drop column if exists status,
  drop column if exists submitted_by,
  drop column if exists submitted_by_name,
  drop column if exists submitted_at,
  drop column if exists approved_by,
  drop column if exists approved_by_name,
  drop column if exists approved_at;
