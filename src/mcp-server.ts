import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import * as os from "os";

// Read port dynamically because the extension might restart and change it
const getBaseUrl = () => {
    const portFile = path.join(os.tmpdir(), '.sql-rely.port');
    let port = 0;
    try {
        if (fs.existsSync(portFile)) {
            port = parseInt(fs.readFileSync(portFile, 'utf8').trim());
        }
    } catch (e) {
        console.error("Could not read port file", e);
    }
    
    if (port === 0) {
        throw new Error("Port file not found or invalid. Ensure SQL Rely is activated in VS Code.");
    }
    
    return `http://127.0.0.1:${port}`;
};

const server = new Server(
  {
    name: "sql-rely-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "run_sql_tests",
        description: "Run all database SQL tests via SQL Rely extension",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "install_sqlcop",
        description: "Install SQLCop tests into the current database via SQL Rely",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "create_sql_test",
        description: "Generate a template for a new tSQLt test",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  try {
      if (name === "run_sql_tests") {
        const response = await axios.post(`${getBaseUrl()}/runTests`);
        return { content: [{ type: "text", text: response.data }] };
      } else if (name === "install_sqlcop") {
        const response = await axios.post(`${getBaseUrl()}/installSqlCop`);
        return { content: [{ type: "text", text: response.data }] };
      } else if (name === "create_sql_test") {
        const response = await axios.post(`${getBaseUrl()}/createTest`);
        return { content: [{ type: "text", text: response.data }] };
      }
      throw new Error(`Tool not found: ${name}`);
  } catch (err: any) {
      return {
          content: [{ type: "text", text: `Error calling tool ${name}: ${err.message}. Make sure SQL Rely is activated in VS Code (open a SQL file).` }],
          isError: true
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SQL Rely MCP server running on stdio");
}

main().catch(console.error);
