# LifeDrop - container image (works on Railway, Render, Fly.io, any Docker host)
FROM node:22-alpine
WORKDIR /app

# Install only the server dependencies (express, cors)
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev

# Copy the website and the server
COPY backend backend
COPY frontend frontend

# Records are saved in /data - mount a persistent volume there
ENV NODE_ENV=production \
    PORT=5000 \
    DATA_DIR=/data
# (runs as root so it can write to hosting volumes, which are mounted as root)
RUN mkdir -p /data

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["node", "backend/server.js"]
