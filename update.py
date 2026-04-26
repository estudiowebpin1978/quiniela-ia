with open('quiniela_analisis.py', 'r') as f:
    content = f.read()

old = 'SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNDc3NTUsImV4cCI6MjA4NzgyMzc1NX0.t_P2iF1eqEo1cqBXt3R4GQV2_XzVQ0VIq_2f6VS_Q2Y" # Please replace with your valid Supabase key'
new = 'SUPABASE_KEY = __import__(\"os\").environ.get(\"SUPABASE_SERVICE_KEY\", \"\")'

content = content.Replace(old, new)

with open('quiniela_analisis.py', 'w') as f:
    f.write(content)

Write-Host 'Updated successfully'