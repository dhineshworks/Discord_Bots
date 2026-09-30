FROM node:20-bookworm-slim

# Install ffmpeg for voice playback
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy all project files
COPY . .

ENV NODE_ENV=production

# Start bot and dashboard
CMD ["npm", "start"]
