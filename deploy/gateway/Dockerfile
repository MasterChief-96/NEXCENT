FROM nginx:stable-alpine
RUN apk add --no-cache apache2-utils
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /docker-entrypoint.d/40-adminer-auth.sh
RUN chmod +x /docker-entrypoint.d/40-adminer-auth.sh
EXPOSE 8080
