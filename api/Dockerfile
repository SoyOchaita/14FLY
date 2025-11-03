# ============================================
# 🏗️ Etapa base: instalación y dependencias
# ============================================
FROM node:20-alpine

# Crear el directorio de trabajo dentro del contenedor
WORKDIR /usr/src/app

# Copiar archivos de definición de dependencias
COPY package*.json ./

# Instalar dependencias (incluye dev para entorno de desarrollo)
RUN npm install

# Copiar el resto del código de la API
COPY . .

# ============================================
# ⚙️ Configuración del servidor
# ============================================
# Definir variables por defecto (se pueden sobrescribir en .env)
ENV PORT=4000
ENV HOST=0.0.0.0

# Exponer el puerto 4000 dentro del contenedor
EXPOSE 4000

# Comando de inicio por defecto para desarrollo (hot reload)
# Para producción, puedes cambiar a: CMD ["npm", "start"]
CMD ["npm", "run", "dev"]
