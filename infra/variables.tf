variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "sentellent"
}

variable "environment" {
  description = "Environment (e.g. prod, staging)"
  type        = string
  default     = "prod"
}

variable "gemini_api_key" {
  description = "Gemini API key"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  sensitive   = true
}

variable "jwt_secret_key" {
  description = "JWT secret key"
  type        = string
  sensitive   = true
}

variable "llm_model" {
  description = "LLM model name"
  type        = string
  default     = "gemini-3.1-flash-lite"
}

variable "llm_provider" {
  description = "LLM provider (gemini/openai)"
  type        = string
  default     = "gemini"
}

variable "domain_name" {
  description = "Custom domain name (optional). Leave empty to use ALB DNS."
  type        = string
  default     = ""
}

variable "frontend_url" {
  description = "Public frontend URL for CORS (optional). Defaults to ALB DNS."
  type        = string
  default     = ""
}
