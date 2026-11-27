# Stage 1: add content hashes to all CSS/JS references (cache busting)
FROM node:24-alpine AS assets
WORKDIR /build
COPY scripts/stamp-assets.mjs scripts/
COPY public public
RUN node scripts/stamp-assets.mjs public

# Stage 2: serve with nginx
FROM nginx:1.30-alpine
# nginx.conf is een template: ${BACKEND_URL} wordt bij het opstarten ingevuld
ENV BACKEND_URL=http://backend:3000
# Umami website-id; docker-compose.test.yml zet het id van acceptance
ENV UMAMI_WEBSITE_ID=d5fec095-4118-4343-8c8d-44199f17ba09
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=assets /build/public /usr/share/nginx/html
EXPOSE 80
