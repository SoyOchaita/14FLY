# ==============================================
# 🏗️ Etapa 1: Compilación de Angular
# ==============================================
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ==============================================
# 🌐 Etapa 2: Servidor NGINX para producción
# ==============================================
FROM nginx:alpine
COPY --from=build /app/dist/14fly-web/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
