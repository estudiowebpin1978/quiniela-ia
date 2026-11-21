# Dockerfile para Railway (Next.js)
FROM node:18-alpine AS builder

# Instalar dependencias
WORKDIR /app
COPY package*.json ./
RUN npm install

# Copiar código fuente
COPY . .
RUN npm run build

# Imagen de producción
FROM node:18-alpine
WORKDIR /app

# Copiar dependencias de producción
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./

# Copiar código fuente
COPY . .

# Exponer puerto
EXPOSE 3000

# Ejecutar servidor
CMD ["npm", "run", "start"]
