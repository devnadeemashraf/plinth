terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# 1. VPC Network
resource "google_compute_network" "vpc" {
  name                    = "${var.project_name}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${var.project_name}-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.gcp_region
  network       = google_compute_network.vpc.id
}

# 2. Cloud Storage Bucket
resource "google_storage_bucket" "storage" {
  name          = "${var.project_name}-storage-${var.environment}"
  location      = var.gcp_region
  force_destroy = false

  uniform_bucket_level_access = true
}

# 3. Cloud SQL PostgreSQL Instance
resource "google_sql_database_instance" "postgres" {
  name             = "${var.project_name}-pg-${var.environment}"
  database_version = "POSTGRES_17"
  region           = var.gcp_region

  settings {
    tier = var.db_tier
    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }
    ip_configuration {
      ipv4_enabled    = true
      private_network = google_compute_network.vpc.id
    }
  }
}

resource "google_sql_database" "db" {
  name     = "plinth_prod"
  instance = google_sql_database_instance.postgres.name
}

# 4. Cloud Memorystore Redis
resource "google_redis_instance" "cache" {
  name           = "${var.project_name}-redis"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = var.gcp_region

  authorized_network = google_compute_network.vpc.id
}

# 5. Cloud Run Service
resource "google_cloud_run_v2_service" "app" {
  name     = "${var.project_name}-service"
  location = var.gcp_region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }

    containers {
      image = "gcr.io/${var.gcp_project_id}/${var.project_name}:latest"

      ports {
        container_port = 3000
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      resources {
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }

      liveness_probe {
        http_get {
          path = "/health/live"
          port = 3000
        }
        period_seconds = 15
      }

      startup_probe {
        http_get {
          path = "/health/ready"
          port = 3000
        }
        period_seconds = 5
      }
    }
  }
}
