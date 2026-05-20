{{/*
Expand the name of the chart.
*/}}
{{- define "foreman.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "foreman.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label.
*/}}
{{- define "foreman.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "foreman.labels" -}}
helm.sh/chart: {{ include "foreman.chart" . }}
{{ include "foreman.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "foreman.selectorLabels" -}}
app.kubernetes.io/name: {{ include "foreman.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend-specific labels.
*/}}
{{- define "foreman.backend.labels" -}}
{{ include "foreman.labels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Backend selector labels.
*/}}
{{- define "foreman.backend.selectorLabels" -}}
{{ include "foreman.selectorLabels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Frontend-specific labels.
*/}}
{{- define "foreman.frontend.labels" -}}
{{ include "foreman.labels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Frontend selector labels.
*/}}
{{- define "foreman.frontend.selectorLabels" -}}
{{ include "foreman.selectorLabels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Secret name for foreman credentials.
*/}}
{{- define "foreman.secretName" -}}
{{- default (printf "%s-secrets" (include "foreman.fullname" .)) .Values.backend.secretName }}
{{- end }}
