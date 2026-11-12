variable "environment" {
  description = "Deployment target environment (staging or production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be either staging or production."
  }
}

variable "aws_region" {
  description = "AWS region for infrastructure provisioning"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Canonical identifier for resource tagging and prefixing"
  type        = string
  default     = "nyx"
}

variable "vpc_cidr" {
  description = "Base CIDR block for the isolated VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_instance_class" {
  description = "RDS instance size tier"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in gigabytes for PostgreSQL"
  type        = number
  default     = 20
}

variable "backup_retention_period" {
  description = "Number of days to retain automated RDS snapshots"
  type        = number
  default     = 7
}

variable "multi_az" {
  description = "Whether to provision high-availability Multi-AZ RDS"
  type        = bool
  default     = false
}

variable "api_cpu" {
  description = "Fargate CPU units for API container"
  type        = number
  default     = 256
}

variable "api_memory" {
  description = "Fargate memory in megabytes for API container"
  type        = number
  default     = 512
}

variable "web_cpu" {
  description = "Fargate CPU units for Web container"
  type        = number
  default     = 256
}

variable "web_memory" {
  description = "Fargate memory in megabytes for Web container"
  type        = number
  default     = 512
}
