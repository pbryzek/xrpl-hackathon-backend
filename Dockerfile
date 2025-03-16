# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Install required dependencies
RUN apk add --no-cache python3 py3-pip make g++ 

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the application's port
EXPOSE 8080

# Start the server
CMD ["npm", "start"]


