FROM node:20-bookworm-slim

# Install system tools and ffmpeg for audio support
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy app files and audio assets
COPY . .

# Expose web dashboard port
EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

# Start bot and dashboard
CMD ["npm", "start"]
