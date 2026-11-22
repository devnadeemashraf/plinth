output "cloud_run_url" {
  description = "URL of the deployed Cloud Run service"
  value       = google_cloud_run_v2_service.app.uri
}

output "cloud_sql_connection" {
  description = "Cloud SQL connection name"
  value       = google_sql_database_instance.postgres.connection_name
}

output "memorystore_host" {
  description = "Cloud Memorystore Redis host"
  value       = google_redis_instance.cache.host
}

output "storage_bucket" {
  description = "GCS storage bucket name"
  value       = google_storage_bucket.storage.name
}
