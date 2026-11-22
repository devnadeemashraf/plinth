variable "gcp_project_id" {
  type        = string
  description = "GCP Project ID"
}

variable "gcp_region" {
  type        = string
  description = "GCP primary region"
  default     = "us-central1"
}

variable "project_name" {
  type        = string
  description = "Application project name"
  default     = "plinth-backend"
}

variable "environment" {
  type        = string
  description = "Target environment"
  default     = "production"
}

variable "db_tier" {
  type        = string
  description = "Cloud SQL machine tier"
  default     = "db-custom-1-3840"
}
