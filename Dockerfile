# Use Node.js 22, matching the project's Node.js requirement.
FROM node:22-bookworm-slim

# Set the working directory.
WORKDIR /app

# Configure the production environment.
ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the application files.
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node data ./data

# Run the application as a non-root user.
USER node

# Expose the application port.
EXPOSE 3000

# Start the Express server.
CMD ["npm", "start"]
