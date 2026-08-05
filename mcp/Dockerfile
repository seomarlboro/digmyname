# Dockerfile for Glama MCP directory checks.
# Builds and runs the domain-check-skills-mcp server over stdio.
FROM node:20-slim

WORKDIR /app

# Install the published package globally so the stdio binary is on PATH.
# (Pinned to the current published version; bump when publishing a new one.)
RUN npm install -g domain-check-skills-mcp@1.2.2

# The server speaks MCP over stdio. Glama's harness spawns this and sends
# initialize / tools/list to verify the server starts and introspects.
ENTRYPOINT ["domain-check-skills-mcp"]
