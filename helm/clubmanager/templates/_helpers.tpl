{{- define "clubmanager.name" -}}{{ .Release.Name }}{{- end -}}
{{- define "clubmanager.labels" -}}
app.kubernetes.io/name: clubmanager
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
