# Use official Node.js image with Puppeteer Chrome dependencies pre-installed
FROM ghcr.io/puppeteer/puppeteer:22.0.0

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

# Start application
CMD ["node", "send_focus.js"]
