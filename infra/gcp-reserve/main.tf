locals {
  name_prefix = "offerpsp-reserve"
  labels = {
    application = "offerpsp"
    component   = "bix-reserve"
    environment = var.environment
    managed_by  = "terraform"
  }

  required_services = toset([
    "artifactregistry.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudtasks.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "pubsub.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
  ])
}

resource "google_project_service" "required" {
  for_each = local.required_services

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_compute_network" "reserve" {
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.required]
}

resource "google_compute_subnetwork" "reserve" {
  name          = "${local.name_prefix}-${var.region}"
  region        = var.region
  network       = google_compute_network.reserve.id
  ip_cidr_range = "10.72.0.0/20"

  private_ip_google_access = true
}

resource "google_compute_global_address" "private_services" {
  name          = "${local.name_prefix}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.reserve.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.reserve.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]

  depends_on = [google_project_service.required]
}

resource "google_service_account" "runtime" {
  account_id   = "offerpsp-reserve-runtime"
  display_name = "OfferPSP reserve runtime"

  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "offerpsp-reserve"
  description   = "Immutable images for the OfferPSP independent reserve"
  format        = "DOCKER"
  labels        = local.labels

  depends_on = [google_project_service.required]
}

resource "google_sql_database_instance" "reserve" {
  name             = "${local.name_prefix}-pg17"
  region           = var.region
  database_version = "POSTGRES_17"

  deletion_protection = true

  settings {
    tier              = var.cloud_sql_tier
    availability_type = "REGIONAL"
    disk_type         = "PD_SSD"
    disk_size         = var.cloud_sql_disk_size_gb
    disk_autoresize   = true
    user_labels       = local.labels

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "01:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 14
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.reserve.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    insights_config {
      query_insights_enabled  = true
      query_plans_per_minute  = 5
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    maintenance_window {
      day          = 7
      hour         = 2
      update_track = "stable"
    }
  }

  depends_on = [google_service_networking_connection.private_services]
}

resource "google_sql_database" "offerpsp" {
  name     = "offerpsp"
  instance = google_sql_database_instance.reserve.name
}

resource "google_project_iam_member" "runtime_cloud_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_pubsub_topic" "outbox" {
  name   = "${local.name_prefix}-outbox"
  labels = local.labels

  message_retention_duration = "604800s"

  depends_on = [google_project_service.required]
}

resource "google_pubsub_topic" "dead_letter" {
  name   = "${local.name_prefix}-dead-letter"
  labels = local.labels

  message_retention_duration = "1209600s"

  depends_on = [google_project_service.required]
}

resource "google_pubsub_subscription" "outbox_worker" {
  name  = "${local.name_prefix}-outbox-worker"
  topic = google_pubsub_topic.outbox.id

  ack_deadline_seconds       = 60
  message_retention_duration = "604800s"

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  expiration_policy {
    ttl = ""
  }
}

resource "google_pubsub_topic_iam_member" "runtime_publish" {
  topic  = google_pubsub_topic.outbox.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_pubsub_subscription_iam_member" "runtime_consume" {
  subscription = google_pubsub_subscription.outbox_worker.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_tasks_queue" "commands" {
  name     = "${local.name_prefix}-commands"
  location = var.region

  rate_limits {
    max_concurrent_dispatches = 10
    max_dispatches_per_second = 5
  }

  retry_config {
    max_attempts       = 8
    max_retry_duration = "3600s"
    min_backoff        = "5s"
    max_backoff        = "300s"
    max_doublings      = 5
  }

  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "runtime_tasks" {
  project = var.project_id
  role    = "roles/cloudtasks.enqueuer"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_storage_bucket" "reserve" {
  name                        = "${var.project_id}-offerpsp-reserve"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 10
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "runtime_objects" {
  bucket = google_storage_bucket.reserve.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_secret_manager_secret" "runtime" {
  for_each = toset([
    "offerpsp-reserve-database-url",
    "offerpsp-primary-gateway-token",
    "offerpsp-writer-fencing-secret",
  ])

  secret_id = each.value
  labels    = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each = google_secret_manager_secret.runtime

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_identity_platform_config" "reserve" {
  autodelete_anonymous_users = true

  sign_in {
    email {
      enabled           = true
      password_required = false
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_service" "worker" {
  count = var.cloud_run_worker_image == "" ? 0 : 1

  name     = "${local.name_prefix}-worker"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = var.cloud_run_min_instances
      max_instance_count = 5
    }

    containers {
      image = var.cloud_run_worker_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "BIX_DATA_PLANE"
        value = "reserve"
      }

      env {
        name  = "BIX_WRITER_MODE"
        value = "standby"
      }
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.reserve.name
        subnetwork = google_compute_subnetwork.reserve.name
      }
      egress = "PRIVATE_RANGES_ONLY"
    }
  }

  labels = local.labels

  depends_on = [
    google_project_service.required,
    google_sql_database_instance.reserve,
  ]
}
