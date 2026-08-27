# OfferPSP independent GCP reserve

This directory provisions the independent GCP data plane described in
`docs/architecture/BIX-RESERVE-ADR.md`.

The reserve is deliberately isolated from Supabase, Vercel and n8n. It starts
in `standby` mode and must never become the active writer without the fenced
writer-lease procedure in `docs/runbooks/BIX-RESERVE-FAILOVER.md`.

## Production baseline

- dedicated GCP project and billing boundary;
- `europe-west1` (Belgium), separate from the primary AWS `eu-west-1` region;
- Cloud SQL PostgreSQL 17, regional HA, private IP only, 2 vCPU / 7.5 GiB;
- point-in-time recovery and 14 retained backups;
- Identity Platform passwordless email authentication;
- private Cloud Run reserve worker, deployed only after an image is supplied;
- Pub/Sub outbox transport and dead-letter topic;
- Cloud Tasks command queue;
- private versioned Cloud Storage bucket;
- Secret Manager containers with no secret values stored in Terraform.

## Financial gate

Do not run `terraform apply` until the project, billing account, region,
configuration and current monthly estimate have been shown to Boris and he has
confirmed the paid Cloud SQL HA creation in that same step.

## Apply sequence

1. Create a dedicated GCP project and link the confirmed billing account.
2. Copy `terraform.tfvars.example` to an untracked `terraform.tfvars` and set the
   actual project ID. Never put credentials in it.
3. Run `terraform init`, `terraform fmt -check`, `terraform validate` and
   `terraform plan`.
4. Review the plan and the current Google Cloud estimate.
5. After explicit confirmation, run `terraform apply`.
6. Add secret versions outside Terraform, build the worker image, then supply an
   immutable image digest and apply again.
7. Run read-only reconciliation before enabling any failover path.

## Safety properties

- Cloud SQL has Terraform deletion protection.
- The database has no public IPv4 address.
- The worker defaults to zero instances and `BIX_WRITER_MODE=standby`.
- Runtime credentials are not committed and not stored in Terraform source.
- A provider outage does not authorize automatic writer promotion.
