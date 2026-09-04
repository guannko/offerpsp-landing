output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "cloud_sql_instance" {
  value = google_sql_database_instance.reserve.connection_name
}

output "cloud_sql_private_ip" {
  value     = google_sql_database_instance.reserve.private_ip_address
  sensitive = true
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "artifact_registry_repository" {
  value = google_artifact_registry_repository.containers.name
}

output "outbox_topic" {
  value = google_pubsub_topic.outbox.id
}

output "reserve_bucket" {
  value = google_storage_bucket.reserve.name
}

output "worker_uri" {
  value = try(google_cloud_run_v2_service.worker[0].uri, null)
}
