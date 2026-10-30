FROM nginx:1.30-alpine
# nginx.conf is een template: ${BACKEND_URL} wordt bij het opstarten ingevuld
ENV BACKEND_URL=http://backend:3000
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY public /usr/share/nginx/html
EXPOSE 80
