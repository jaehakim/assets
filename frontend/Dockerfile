# 정적 파일 빌드는 빌드 호스트 네이티브 플랫폼에서 실행한다(CI x64 러너의 arm64 QEMU 에뮬레이션에서 npm ci가 멈춤, 2026-11-23). 레거시 빌더는 arm64 기본값.
FROM --platform=${BUILDPLATFORM:-linux/arm64} node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY assetflow-proxy.inc /etc/nginx/conf.d/assetflow-proxy.inc
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
