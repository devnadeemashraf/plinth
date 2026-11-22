# Google Cloud Platform (GCP) Production Terraform Blueprint

This blueprint provisions a scalable, production-grade Google Cloud architecture using Terraform:
- **Compute**: Google Cloud Run v2 container service with zero-to-N scaling, startup and liveness probes, and graceful shutdown.
- **Database**: Google Cloud SQL PostgreSQL 17 in private VPC with automated backups.
- **Cache**: Google Cloud Memorystore for Redis.
- **Storage**: Google Cloud Storage (GCS) bucket with uniform bucket-level access.
- **Networking**: Dedicated VPC network and custom subnet.

## Quickstart

1. Authenticate with Google Cloud:
   ```bash
   gcloud auth application-default login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. Initialize and deploy:
   ```bash
   cd deploy/gcp
   terraform init
   terraform apply -var="gcp_project_id=YOUR_PROJECT_ID"
   ```
