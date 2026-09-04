variable "project_id" {
  description = "Dedicated Google Cloud project for the independent OfferPSP reserve."
  type        = string
}

variable "region" {
  description = "GCP region. It must not share the primary Supabase/AWS failure domain."
  type        = string
  default     = "europe-west1"
}

variable "environment" {
  description = "Deployment environment label."
  type        = string
  default     = "production"
}

variable "cloud_sql_tier" {
  description = "Cloud SQL machine tier. The production baseline is 2 vCPU / 7.5 GiB."
  type        = string
  default     = "db-custom-2-7680"
}

variable "cloud_sql_disk_size_gb" {
  description = "Initial SSD size. Automatic growth remains enabled."
  type        = number
  default     = 20
}

variable "cloud_run_worker_image" {
  description = "Optional immutable container image for the reserve worker. Empty keeps the paid runtime undeployed."
  type        = string
  default     = ""
}

variable "cloud_run_min_instances" {
  description = "Warm worker instances. Keep at zero until the worker image is verified."
  type        = number
  default     = 0
}

variable "alert_email" {
  description = "Optional operations email used by later monitoring configuration."
  type        = string
  default     = ""
}
