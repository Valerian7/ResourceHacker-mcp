#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname, join, resolve, isAbsolute } from "path";
import fs from "fs/promises";
import os from "os";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get ResourceHacker.exe path from environment variable or use default
const RESOURCE_HACKER_PATH = process.env.RESOURCE_HACKER_PATH || "ResourceHacker.exe";

/**
 * Execute ResourceHacker with given arguments
 */
async function executeResourceHacker(args, timeout = 30000) {
  try {
    const { stdout, stderr } = await execFileAsync(
      RESOURCE_HACKER_PATH,
      args,
      {
        timeout,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      }
    );
    return { success: true, stdout, stderr };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      code: error.code,
    };
  }
}

/**
 * Parse resource mask (Type,Name,Language)
 */
function parseResourceMask(mask) {
  if (!mask) return ",,";
  const parts = mask.split(",");
  while (parts.length < 3) parts.push("");
  return parts.slice(0, 3).join(",");
}

/**
 * Parse RC file content to extract resource summary
 */
function parseRcFile(content) {
  const lines = content.split(/\r?\n/);
  const resources = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    // Regex to capture: (Name) (Type) ...
    const match = trimmed.match(/^(".*?"|\S+)\s+(\S+)/);
    if (match) {
        const name = match[1];
        const type = match[2];
        // Filter out common RC keywords
        if (["LANGUAGE", "CODEPAGE", "1", "24"].includes(name) && type === "RT_MANIFEST") {
             resources.push(`${type.padEnd(20)} ${name}`);
             continue;
        }
        if (["LANGUAGE", "CODEPAGE"].includes(name)) continue;
        
        resources.push(`${type.padEnd(20)} ${name}`);
    }
  }
  
  if (resources.length === 0) return "No resources found or failed to parse RC file.";
  return "Type                 Name/ID\n" + "-".repeat(40) + "\n" + resources.join("\n");
}

/**
 * Resolve file path (handle relative and absolute paths)
 */
function resolveFilePath(filePath) {
  if (!filePath) return "";
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

/**
 * Main server class
 */
class ResourceHackerMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "resource-hacker-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "extract_resource",
          description: "Extract resource(s) from a PE file (exe, dll, etc) or resource file. Can extract single resource or multiple resources to a folder.",
          inputSchema: {
            type: "object",
            properties: {
              input_file: {
                type: "string",
                description: "Path to the input PE file or resource file",
              },
              output_path: {
                type: "string",
                description: "Output file path or folder path for extraction",
              },
              resource_mask: {
                type: "string",
                description: "Resource mask in format 'Type,Name,Language' (e.g., 'ICON,,' or 'BITMAP,128,0'). Empty parts can be omitted.",
                default: ",,",
              },
              log_file: {
                type: "string",
                description: "Log file path. Use 'CONSOLE' or 'CON' for console output, 'NUL' to disable logging",
                default: "CONSOLE",
              },
            },
            required: ["input_file", "output_path"],
          },
        },
        {
          name: "add_resource",
          description: "Add a new resource to a PE file. Fails if resource already exists. Use addoverwrite or addskip for different behaviors.",
          inputSchema: {
            type: "object",
            properties: {
              input_file: {
                type: "string",
                description: "Path to the PE file to modify",
              },
              output_file: {
                type: "string",
                description: "Path for the output file",
              },
              resource_file: {
                type: "string",
                description: "Path to the resource file to add (e.g., .ico, .bmp, .rc, .res)",
              },
              resource_mask: {
                type: "string",
                description: "Resource mask 'Type,Name,Language' (e.g., 'ICONGROUP,MAINICON,0')",
                default: ",,",
              },
              mode: {
                type: "string",
                enum: ["add", "addoverwrite", "addskip"],
                description: "Add mode: 'add' (fail if exists), 'addoverwrite' (replace if exists), 'addskip' (skip if exists)",
                default: "add",
              },
              log_file: {
                type: "string",
                description: "Log file path",
                default: "CONSOLE",
              },
            },
            required: ["input_file", "output_file", "resource_file"],
          },
        },
        {
          name: "delete_resource",
          description: "Delete resource(s) from a PE file",
          inputSchema: {
            type: "object",
            properties: {
              input_file: {
                type: "string",
                description: "Path to the PE file to modify",
              },
              output_file: {
                type: "string",
                description: "Path for the output file",
              },
              resource_mask: {
                type: "string",
                description: "Resource mask 'Type,Name,Language' to identify resources to delete",
              },
              log_file: {
                type: "string",
                description: "Log file path",
                default: "CONSOLE",
              },
            },
            required: ["input_file", "output_file", "resource_mask"],
          },
        },
        {
          name: "modify_resource",
          description: "Modify an existing resource in a PE file",
          inputSchema: {
            type: "object",
            properties: {
              input_file: {
                type: "string",
                description: "Path to the PE file to modify",
              },
              output_file: {
                type: "string",
                description: "Path for the output file",
              },
              resource_file: {
                type: "string",
                description: "Path to the new resource file",
              },
              resource_mask: {
                type: "string",
                description: "Resource mask 'Type,Name,Language'",
                default: ",,",
              },
              log_file: {
                type: "string",
                description: "Log file path",
                default: "CONSOLE",
              },
            },
            required: ["input_file", "output_file", "resource_file"],
          },
        },
        {
          name: "compile_rc",
          description: "Compile a resource script (.rc) file to a binary resource (.res) file",
          inputSchema: {
            type: "object",
            properties: {
              input_rc: {
                type: "string",
                description: "Path to the .rc resource script file",
              },
              output_res: {
                type: "string",
                description: "Path for the output .res file",
              },
              log_file: {
                type: "string",
                description: "Log file path",
                default: "CONSOLE",
              },
            },
            required: ["input_rc", "output_res"],
          },
        },
        {
          name: "change_language",
          description: "Change the language of all resources in a PE file",
          inputSchema: {
            type: "object",
            properties: {
              input_file: {
                type: "string",
                description: "Path to the PE file to modify",
              },
              output_file: {
                type: "string",
                description: "Path for the output file",
              },
              language_id: {
                type: "number",
                description: "Language ID (e.g., 1033 for English-US, 1049 for Russian, 2052 for Chinese-Simplified)",
              },
              log_file: {
                type: "string",
                description: "Log file path",
                default: "CONSOLE",
              },
            },
            required: ["input_file", "output_file", "language_id"],
          },
        },
        {
          name: "run_script",
          description: "Execute a ResourceHacker script file with multiple commands",
          inputSchema: {
            type: "object",
            properties: {
              script_file: {
                type: "string",
                description: "Path to the ResourceHacker script file",
              },
            },
            required: ["script_file"],
          },
        },
        {
          name: "get_help",
          description: "Get ResourceHacker command-line help information",
          inputSchema: {
            type: "object",
            properties: {
              topic: {
                type: "string",
                enum: ["general", "commandline", "script"],
                description: "Help topic to display",
                default: "general",
              },
            },
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case "list_resources":
            return await this.handleListResources(args);

          case "extract_resource":
            return await this.handleExtractResource(args);

          case "add_resource":
            return await this.handleAddResource(args);

          case "delete_resource":
            return await this.handleDeleteResource(args);

          case "modify_resource":
            return await this.handleModifyResource(args);

          case "compile_rc":
            return await this.handleCompileRC(args);

          case "change_language":
            return await this.handleChangeLanguage(args);

          case "run_script":
            return await this.handleRunScript(args);

          case "get_help":
            return await this.handleGetHelp(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async handleListResources(args) {
    const { input_file } = args;
    const tempRcPath = join(os.tmpdir(), `rh_temp_${Date.now()}.rc`);

    try {
      const cmdArgs = [
        "-open", resolveFilePath(input_file),
        "-save", tempRcPath,
        "-action", "extract",
        "-mask", ",,",
        "-log", "NUL",
      ];

      const result = await executeResourceHacker(cmdArgs);

      if (!result.success) {
        return {
          content: [
            {
              type: "text",
              text: `✗ Failed to list resources (extraction failed)\n\nError: ${result.error}\n${result.stderr}`,
            },
          ],
          isError: true,
        };
      }

      try {
        const rcContent = await fs.readFile(tempRcPath, "utf8");
        const summary = parseRcFile(rcContent);
        return {
          content: [
            {
              type: "text",
              text: `✓ Resources listed for: ${input_file}\n\n${summary}`,
            },
          ],
        };
      } catch (readError) {
        return {
          content: [
            {
              type: "text",
              text: `Error reading generated RC file: ${readError.message}`,
            },
          ],
          isError: true,
        };
      }
    } finally {
      // Cleanup
      try {
        await fs.unlink(tempRcPath);
      } catch (e) {
        // Ignore cleanup error
      }
    }
  }

  async handleExtractResource(args) {
    const { input_file, output_path, resource_mask = ",,", log_file = "CONSOLE" } = args;

    const cmdArgs = [
      "-open", resolveFilePath(input_file),
      "-save", resolveFilePath(output_path),
      "-action", "extract",
      "-mask", parseResourceMask(resource_mask),
      "-log", log_file,
    ];

    const result = await executeResourceHacker(cmdArgs);

    return {
      content: [
        {
          type: "text",
          text: result.success
            ? `✓ Resource extraction completed successfully\n\nOutput: ${output_path}\n\n${result.stdout || result.stderr}`
            : `✗ Resource extraction failed\n\nError: ${result.error}\n${result.stderr}`,
        },
      ],
    };
  }

  async handleAddResource(args) {
    const {
      input_file,
      output_file,
      resource_file,
      resource_mask = ",,",
      mode = "add",
      log_file = "CONSOLE",
    } = args;

    const cmdArgs = [
      "-open", resolveFilePath(input_file),
      "-save", resolveFilePath(output_file),
      "-resource", resolveFilePath(resource_file),
      "-action", mode,
      "-mask", parseResourceMask(resource_mask),
      "-log", log_file,
    ];

    const result = await executeResourceHacker(cmdArgs);

    return {
      content: [
        {
          type: "text",
          text: result.success
            ? `✓ Resource added successfully (mode: ${mode})\n\nOutput: ${output_file}\n\n${result.stdout || result.stderr}`
            : `✗ Failed to add resource\n\nError: ${result.error}\n${result.stderr}`,
        },
      ],
    };
  }

  async handleDeleteResource(args) {
    const { input_file, output_file, resource_mask, log_file = "CONSOLE" } = args;

    const cmdArgs = [
      "-open", resolveFilePath(input_file),
      "-save", resolveFilePath(output_file),
      "-action", "delete",
      "-mask", parseResourceMask(resource_mask),
      "-log", log_file,
    ];

    const result = await executeResourceHacker(cmdArgs);

    return {
      content: [
        {
          type: "text",
          text: result.success
            ? `✓ Resource deleted successfully\n\nOutput: ${output_file}\n\n${result.stdout || result.stderr}`
            : `✗ Failed to delete resource\n\nError: ${result.error}\n${result.stderr}`,
        },
      ],
    };
  }

  async handleModifyResource(args) {
    const {
      input_file,
      output_file,
      resource_file,
      resource_mask = ",,",
      log_file = "CONSOLE",
    } = args;

    const cmdArgs = [
      "-open", resolveFilePath(input_file),
      "-save", resolveFilePath(output_file),
      "-resource", resolveFilePath(resource_file),
      "-action", "modify",
      "-mask", parseResourceMask(resource_mask),
      "-log", log_file,
    ];

    const result = await executeResourceHacker(cmdArgs);

    return {
      content: [
        {
          type: "text",
          text: result.success
            ? `✓ Resource modified successfully\n\nOutput: ${output_file}\n\n${result.stdout || result.stderr}`
            : `✗ Failed to modify resource\n\nError: ${result.error}\n${result.stderr}`,
        },
      ],
    };
  }

  async handleCompileRC(args) {
    const { input_rc, output_res, log_file = "CONSOLE" } = args;

    const cmdArgs = [
      "-open", resolveFilePath(input_rc),
      "-save", resolveFilePath(output_res),
      "-action", "compile",
      "-log", log_file,
    ];

    const result = await executeResourceHacker(cmdArgs);

    return {
      content: [
        {
          type: "text",
          text: result.success
            ? `✓ RC file compiled successfully\n\nOutput: ${output_res}\n\n${result.stdout || result.stderr}`
            : `✗ Failed to compile RC file\n\nError: ${result.error}\n${result.stderr}`,
        },
      ],
    };
  }

  async handleChangeLanguage(args) {
    const { input_file, output_file, language_id, log_file = "CONSOLE" } = args;

    const cmdArgs = [
      "-open", resolveFilePath(input_file),
      "-save", resolveFilePath(output_file),
      "-action", `changelanguage(${language_id})`,
      "-log", log_file,
    ];

    const result = await executeResourceHacker(cmdArgs);

    return {
      content: [
        {
          type: "text",
          text: result.success
            ? `✓ Language changed successfully to ID ${language_id}\n\nOutput: ${output_file}\n\n${result.stdout || result.stderr}`
            : `✗ Failed to change language\n\nError: ${result.error}\n${result.stderr}`,
        },
      ],
    };
  }

  async handleRunScript(args) {
    const { script_file } = args;

    const cmdArgs = ["-script", resolveFilePath(script_file)];

    const result = await executeResourceHacker(cmdArgs);

    return {
      content: [
        {
          type: "text",
          text: result.success
            ? `✓ Script executed successfully\n\n${result.stdout || result.stderr}`
            : `✗ Script execution failed\n\nError: ${result.error}\n${result.stderr}`,
        },
      ],
    };
  }

  async handleGetHelp(args) {
    const { topic = "general" } = args;

    let cmdArgs;
    if (topic === "commandline") {
      cmdArgs = ["-help", "commandline"];
    } else if (topic === "script") {
      cmdArgs = ["-help", "script"];
    } else {
      cmdArgs = ["-help"];
    }

    const result = await executeResourceHacker(cmdArgs, 10000);

    return {
      content: [
        {
          type: "text",
          text: result.stdout || result.stderr || "No help output available",
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Resource Hacker MCP server running on stdio");
  }
}

// Start the server
const server = new ResourceHackerMCPServer();
server.run().catch(console.error);
