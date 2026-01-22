# Alchemy Thoth Development Guide

## Overview

Thoth is the AI/LLM plugin for AlchemyMVC. It provides:
- Client for communicating with LLM endpoints (OpenAI-compatible)
- Models for managing MLM configurations and chat sessions
- Actions system for reusable LLM prompts with configurable parameters
- MCP (Model Context Protocol) server for AI assistant integration

## Dependencies

@node_modules/alchemymvc/CLAUDE.md

## Directory Structure

```
lib/
├── 00-base.js              # Thoth.Base namespace class
├── client.js               # Thoth.Client - LLM API client
├── conduit/
│   └── mcp_conduit.js      # Thoth.Conduit.Mcp - MCP request wrapper
└── mcp/
    ├── 00-mcp_base.js      # Thoth.Mcp.Base namespace
    ├── 10-mcp_tools.js     # Thoth.Mcp.Tools base class
    ├── 20-mcp_manager.js   # Thoth.Mcp.Manager - session management
    ├── 30-mcp_server.js    # Thoth.Mcp.Server - server config
    └── example_tools.js    # echo, calculate, init_session, guarded_echo

model/
├── 00-thoth_base_model.js  # Alchemy.Model.Thoth.Base namespace
├── thoth_mlm_model.js      # MLM model configurations
├── thoth_chat_mlm_model.js # Chat-specific MLM configs
├── thoth_action_model.js   # Reusable LLM actions/prompts
├── thoth_chat_session_model.js  # Chat sessions
├── thoth_chat_message_model.js  # Individual chat messages
└── thoth_mcp_api_key_model.js   # MCP API key storage

controller/
└── thoth_mcp_controller.js # Handles MCP routes

element/
└── thoth_chat_session_element.js  # <thoth-chat-session> element

config/
└── settings.js             # Plugin settings

bootstrap.js                # MCP server registry & initialization
```

## Namespaces

**Lib classes:** `Thoth.*` (e.g., `Thoth.Base`, `Thoth.Client`)

**MCP classes:** `Thoth.Mcp.*` (e.g., `Thoth.Mcp.Tools`, `Thoth.Mcp.Manager`)

**Models:** `Alchemy.Model.Thoth.*` with model names `Thoth_*` (e.g., `Thoth_Mlm`, `Thoth_Action`, `Thoth_McpApiKey`)

## Configuration

Settings are managed via the plugin settings system:

```javascript
// Access via alchemy.settings.plugins.thoth
endpoint    // The Thoth/LLM server URL
client      // Client identifier slug
access_key  // API access key
enable_chat // Enable default chat functionality (boolean)
```

When all three connection settings are configured, `alchemy.plugins.thoth.client_instance` is created automatically.

## Thoth.Client

The client supports OpenAI-compatible endpoints:

```javascript
const client = alchemy.plugins.thoth.client_instance;

// Chat completions (OpenAI-compatible)
let response = await client.generateCompletion({
    model: 'gpt-4',
    messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello!' }
    ],
    max_tokens: 2500,
    response_format: 'text',  // or 'json_object'
});

// Access response
let content = response.choices[0].message.content;

// Streaming support
let stream = client.generateCompletion({
    model: 'gpt-4',
    messages: [...],
    stream: true
});

stream.on('data', chunk => {
    // chunk.choices[0].delta.content
});
```

### Text Completion (Legacy)

```javascript
// For models that use the older completion API
let result = await client.generateTextCompletion('model-slug', 'prompt text', {
    max_tokens: 1000
});
```

## Models

### Thoth_Mlm

MLM (Machine Learning Model) configurations:

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Display name |
| `thoth_slug` | String | Model identifier sent to API |
| `slug` | String | URL-safe identifier (auto-generated) |

Document method:
```javascript
let mlm = await Thoth_Mlm.findByPk(id);
let result = await mlm.generateTextCompletion('prompt text', { max_tokens: 500 });
```

### Thoth_Action

Reusable LLM actions with configurable prompts:

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Action name |
| `thoth_mlm_id` | BelongsTo | MLM to use |
| `response_type` | Enum | `text` or `json` |
| `system_prompt` | Text | System prompt |
| `messages` | Schema[] | Multi-shot example messages |
| `wrapper` | Text | Template wrapping user input (`{{text}}` placeholder) |
| `max_output_tokens` | Integer | Token limit |

Document method:
```javascript
let action = await Thoth_Action.findByPk(id);
await action.populate('ThothMlm');

// Perform the action with input data
let result = await action.performAction('User input text');
// or
let result = await action.performAction({ structured: 'data' });
```

### Thoth_ChatSession

Chat sessions belonging to users:

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | BelongsTo | User owner |
| `title` | String | Session title |

### Thoth_ChatMessage

Individual messages in chat sessions:

| Field | Type | Description |
|-------|------|-------------|
| `thoth_chat_session_id` | BelongsTo | Parent session |
| `thoth_chat_mlm_id` | BelongsTo | MLM that responded (if AI) |
| `user_id` | BelongsTo | User who sent (if human) |
| `text` | Text | Message content |
| `parent_id` | BelongsTo | Parent message (for threading) |

## Elements

### `<thoth-chat-session>`

Custom element for rendering chat sessions:

```hawkejs
<thoth-chat-session #record={% session %}></thoth-chat-session>
```

Template: `elements/thoth/chat_session`

## Plugin Access

```javascript
// Check if Thoth is configured
if (alchemy.plugins.thoth.has_thoth) {
    let client = alchemy.plugins.thoth.client_instance;
    // Use client...
}
```

## MCP Server Support

MCP (Model Context Protocol) allows AI assistants to connect to your Alchemy application. Thoth supports **multiple isolated MCP servers** per application.

### Architecture

Each MCP server is fully isolated with its own Manager, sessions Map, filtered tools, and auth settings. Servers are stored in `alchemy.plugins.thoth.mcp_servers` (a Map keyed by server name).

### Configuration

**Declarative (recommended):**
```javascript
// Via usePlugin()
alchemy.usePlugin('thoth', {
    mcp_servers: {
        team: {
            path: '/mcp/team',
            tool_classes: ['TeamTools'],
            require_api_key: true,
            requires: 'init_session',  // All tools require init_session first
        },
        public: {
            path: '/mcp/public',
            tool_names: ['init_session', 'server_info'],
            allow_anonymous: true,
            require_api_key: false,
        }
    }
});
```

**Programmatic (for plugins):**
```javascript
STAGES.getStage('routes').addPostTask(() => {
    alchemy.plugins.thoth.createMcpServer({
        name: 'my-plugin',
        path: '/mcp/my-plugin',
        tool_classes: ['MyPluginTools'],
    });
});
```

### Server Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | String | required | Server identifier |
| `path` | String | `/mcp` | URL path |
| `require_api_key` | Boolean | `true` | Require API key auth |
| `allow_anonymous` | Boolean | `false` | Allow unauthenticated access |
| `session_timeout` | Number | `3600000` | Session timeout (ms) |
| `tool_classes` | String[] | `null` | Tool class names to include (null = all) |
| `tool_names` | String[] | `null` | Specific tool names to include |
| `requires` | String/Object | `null` | Default tool requirement for all tools (see below) |

### Directory Structure

```
lib/
├── conduit/
│   └── mcp_conduit.js       # Thoth.Conduit.Mcp - MCP request wrapper
└── mcp/
    ├── 00-mcp_base.js       # Thoth.Mcp.Base namespace
    ├── 05-mcp_tool.js       # Thoth.Mcp.Tool - individual tool class
    ├── 10-mcp_tools.js      # Thoth.Mcp.Tools - tool collection base class
    ├── 14-tool_history_entry.js  # Thoth.Mcp.ToolHistoryEntry - tool call tracking
    ├── 15-mcp_session.js    # Thoth.Mcp.Session - client session class
    ├── 20-mcp_manager.js    # Thoth.Mcp.Manager - session management
    ├── 21-mcp_tool_executor.js  # Thoth.Mcp.ToolExecutor - execution logic
    ├── 22-mcp_response.js   # Thoth.Mcp.Response - response builder
    └── 30-mcp_server.js     # Thoth.Mcp.Server - server config container
```

### Creating Tools

Tools are grouped in classes inheriting from `Thoth.Mcp.Tools`:

```javascript
// app/lib/mcp/employee_tools.js
const EmployeeTools = Function.inherits('Thoth.Mcp.Tools', 'EmployeeTools');

EmployeeTools.addTool('list_employees', {
    description: 'List employees with optional filters',
    permission: 'employee.read',  // ACL permission (optional)
}, function schema() {
    this.addParameter('status', 'Enum', {
        values: {active: 'Active', inactive: 'Inactive'},
        mcp_description: 'Filter by status',
    });
    this.addParameter('limit', 'Integer', {
        default: 20,
        mcp_description: 'Max results',
    });
}, async function execute(conduit, params) {
    let Employee = conduit.getModel('Employee');
    let crit = Employee.find();
    
    if (params.status) {
        crit.where('status').equals(params.status);
    }
    
    return Employee.find('all', crit.limit(params.limit));
});
```

### Tool Response Formatting

Tools can return plain objects (auto-converted to JSON), strings (simple text), or use the `McpResponse` builder for structured output.

**Using `this.createResponse()` (recommended for complex output):**

```javascript
EmployeeTools.addTool('get_team_status', {
    description: 'Get team status overview',
}, function schema() {
}, async function execute(conduit, params) {
    
    // Build structured response
    let response = this.createResponse()
        .header('Team Status')
        .line('Current team availability:')
        .blank();
    
    response.section('Working', 5)
        .bullet('Alice - Office')
        .bullet('Bob - Remote')
        .blank();
    
    response.section('On Leave', 2)
        .bullet('Charlie - Vacation until Jan 25')
        .blank();
    
    response.summary('Summary: 5 working, 2 on leave');
    
    return response;
});
```

**McpResponse builder methods:**

| Method | Description |
|--------|-------------|
| `header(text)` | Add `# Title` |
| `subheader(text)` | Add `## Subtitle` |
| `section(title, count?)` | Add `Title (count):` |
| `line(text)` | Add plain text line |
| `bullet(text)` | Add `• text` |
| `blank()` | Add empty line |
| `summary(text)` | Add summary line |
| `indent()` / `dedent()` | Manage indentation |
| `openTag(name, callback?)` | Add `<name>` with optional auto-close |
| `asError()` | Mark response as error |

**Error responses:**

```javascript
if (params.value < 0) {
    return this.createResponse()
        .line('Value cannot be negative')
        .asError();
}
```

**Simple returns still work:**

```javascript
// Plain object - auto-converted to JSON text
return { employees: [...], count: 10 };

// String - simple text response
return 'No employees found.';
```

### Tool Options

| Option | Description |
|--------|-------------|
| `description` | Tool description for AI |
| `permission` | Required ACL permission |
| `requires` | Tool dependency (see below) |
| `auto_callable` | Allow this tool to be auto-called (see below) |
| `inject_reminder` | Auto-inject reminders (see below) |

### Parameter Lookups

Parameters can auto-fetch documents from the database, similar to route parameter resolution in AlchemyMVC:

```javascript
EmployeeTools.addTool('get_employee_details', {
    description: 'Get details about an employee',
}, function schema() {
    this.addParameter('employee_slug', 'String', {
        mcp_description: 'Employee slug',
        required: true,
        lookup: 'Employee',           // Model to look up
        lookup_field: 'slug',         // Field to search by (default: param name)
        lookup_as: 'employee',        // Key to store document (default: lowercase model)
    });
}, async function execute(conduit, params) {
    // params.employee_slug = 'john-doe' (original string)
    // params.employee = Employee document (auto-fetched!)
    let employee = params.employee;
    return { name: employee.fullname, status: employee.status };
});
```

**Lookup Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `lookup` | String | - | Model name to auto-fetch |
| `lookup_field` | String | parameter name | Field to search by |
| `lookup_as` | String | lowercase model name | Key to store fetched document |
| `lookup_required` | Boolean | `true` | Throw `NotFound` error if document missing |

**Optional lookups** (for parameters that filter but aren't required):

```javascript
this.addParameter('employee_slug', 'String', {
    mcp_description: 'Filter by employee (optional)',
    lookup: 'Employee',
    lookup_field: 'slug',
    lookup_as: 'employee',
    lookup_required: false,  // Don't error if not found
});

// In execute:
if (params.employee) {
    crit.where('employee_id').equals(params.employee.$pk);
}
```

**How it works:**
- Uses `Model.checkPathValue()` internally (same as route parameter resolution)
- Throws `Thoth.Mcp.Error.NotFound` if document not found and `lookup_required` is true
- Skips lookup silently if parameter value is null/empty

### Tool Requirements (`requires`)

Enforce that another tool was called first. Requirements can be set at server-level (applies to all tools) or per-tool.

**Server-level requirement:**
```javascript
// All tools on this server require init_session first
alchemy.usePlugin('thoth', {
    mcp_servers: {
        team: {
            path: '/mcp/team',
            requires: 'init_session',  // Default for all tools
        }
    }
});
```

**Per-tool requirement:**
```javascript
// Simple: must have called init_session at some point
EmployeeTools.addTool('get_data', {
    requires: 'init_session',
}, ...);

// With constraints
EmployeeTools.addTool('get_data', {
    requires: {
        tool: 'init_session',
        max_calls_ago: 10,     // Within last 10 tool calls
        max_seconds_ago: 300,  // OR within last 5 minutes
    },
}, ...);

// Opt out of server-level requirement
EmployeeTools.addTool('init_session', {
    requires: false,  // This tool can be called without meeting server requires
}, ...);
```

**Resolution order:** Tool's own `requires` takes precedence. If tool sets `requires: false`, it bypasses server-level requirements.

### Auto-Callable Tools (`auto_callable`)

Tools marked as `auto_callable: true` can be automatically called when they are required by another tool. This allows lightweight initialization tools to run automatically without the AI needing to call them explicitly.

```javascript
// Define an auto-callable initialization tool
EmployeeTools.addTool('init_session', {
    description   : 'Initialize session context',
    requires      : false,        // Opt out of server-level requires
    auto_callable : true,         // Can be auto-called
}, function schema() {
    // No parameters - auto_callable tools cannot have required params
}, async function execute(conduit, params) {
    return { initialized: true, timestamp: new Date().toISOString() };
});

// This tool requires init_session - it will be auto-called if needed
EmployeeTools.addTool('get_employees', {
    description : 'Get list of employees',
    requires    : 'init_session',
}, ...);
```

**Rules:**
- Auto-callable tools **must not have required parameters** (validated at boot time)
- Auto-call output is **prepended** to the main tool's response
- **Chaining** is supported: if tool A requires B, and B requires C, both B and C will be auto-called
- **Cycle detection** prevents infinite loops (throws error if detected)

**Output format when auto-called:**
```
<auto-called-tools>

--- init_session ---
{
  "initialized": true,
  "timestamp": "2025-01-22T..."
}

</auto-called-tools>

{actual tool output}
```

### Inject Reminders (`inject_reminder`)

Automatically append reminders to tool responses:

```javascript
// Function form - called after every tool
inject_reminder: async (conduit, tool_history) => {
    if (tool_history.total_calls > 20) {
        return 'Consider refreshing context for updated info.';
    }
    return null;  // No reminder
}

// Object form - conditional with throttling
inject_reminder: {
    after_calls: 10,      // Inject after 10 calls without this tool
    after_seconds: 300,   // OR after 5 minutes
    min_interval: 60,     // Don't remind more than once per minute
    message: 'Remember to call X periodically.',
}
```

### Example Tools

The plugin includes example tools for testing and demonstration:

| Tool | Description |
|------|-------------|
| `echo` | Echo back a message |
| `calculate` | Basic math operations |
| `server_info` | Get Alchemy server information |
| `list_tools` | List available MCP tools |
| `init_session` | Example session initialization (`requires: false`, `auto_callable: true`) |
| `guarded_echo` | Echo that requires `init_session` first |
| `admin_info` | Requires `thoth.admin` permission |

**Note:** Apps should create their own initialization tools with domain-specific context rather than relying on these examples.

### MCP Conduit (`Thoth.Conduit.Mcp`)

Tools receive an MCP conduit with extra methods:

```javascript
async function execute(conduit, params) {
    // Standard Alchemy conduit methods work
    let Employee = conduit.getModel('Employee');
    let user = conduit.session('UserData');
    
    // MCP-specific
    let mcp_user = conduit.getMcpUser();        // User from API key
    let server = conduit.mcp_server;            // The McpServer instance
    
    // Session data (persists across requests in same MCP session)
    conduit.setMcpData('key', value);
    let val = conduit.getMcpData('key', default);
    conduit.hasMcpData('key');
    conduit.deleteMcpData('key');
    
    // Tool history
    conduit.hasCalledTool('init_session');
    conduit.hasCalledTool('init_session', {max_calls_ago: 5});
    let history = conduit.getToolHistory();
    
    // Queue messages to append to response
    conduit.queueInjection('Important note', {priority: 'high', type: 'warning'});
    
    // Call another tool from within this tool
    // - Properly tracks the call in history
    // - Resolves auto-call requirements if needed
    // - Returns the raw result (not MCP-formatted)
    let result = await conduit.callTool('other_tool', { param: 'value' });
}
```

### API Keys (`Thoth_McpApiKey`)

```javascript
let McpApiKey = Model.get('Thoth_McpApiKey');
let key_doc = McpApiKey.createDocument({
    name: 'My Assistant',
    user_id: user.$pk,
    scopes: ['employee.read'],      // Permission scopes
    allowed_servers: ['team'],      // Restrict to specific servers (empty = all)
    default_headers: [              // Virtual headers for this key
        {name: 'X-MCP-Recover-Session', value: 'true'}
    ],
});

let raw_key = await key_doc.generateKey();  // Only shown once!
await key_doc.save();
```

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | BelongsTo | User this key authenticates as |
| `name` | String | Friendly name |
| `scopes` | String[] | Allowed permission scopes |
| `allowed_servers` | String[] | Server names key can access (empty = all) |
| `default_headers` | Schema[] | Virtual headers `{name, value}` |
| `is_active` | Boolean | Whether key is active |
| `expires` | Datetime | Expiration (optional) |

### Sticky Session Recovery

Some MCP clients incorrectly close sessions after each message. Enable recovery via:

1. **HTTP Header:** `X-MCP-Recover-Session: true`
2. **API Key config:** Add to `default_headers`

When enabled, reconnecting clients with the same user_id recover their previous session's tool history.

### Accessing Servers

```javascript
// Get a specific server
let server = alchemy.plugins.thoth.getMcpServer('team');
let manager = server.manager;

// Get all servers
let all = alchemy.plugins.thoth.getAllMcpServers();  // Map

// From inside a tool (via conduit)
let server = conduit.mcp_server;
```

### Client Connection

- **URL:** `https://your-app.com/mcp/team` (server's path)
- **Auth:** `Authorization: Bearer mcp_live_abc123...`
- **Session:** Returned in `Mcp-Session-Id` header after initialize

## Tool Architecture

### McpTool Class

Each tool is an instance of `Thoth.Mcp.Tool`. When you call `McpTools.addTool()`, it creates an `McpTool` instance.

**Inside execute functions, `this` is the McpTool instance:**

```javascript
EmployeeTools.addTool('my_tool', {
    description: 'Example tool',
}, function schema() {
    // ... parameter definitions
}, async function execute(conduit, params) {
    // `this` is the McpTool instance
    this.name           // 'my_tool'
    this.description    // 'Example tool'
    this.schema         // The parameter schema
    this.tools_class    // EmployeeTools class reference
    
    // Create responses via instance method
    return this.createResponse()
        .header('Result')
        .line('Done!');
});
```

**Available on `this` in execute functions:**
- `this.createResponse()` - Create an McpResponse builder
- `this.name` - The tool name
- `this.description` - Tool description
- `this.schema` - Parameter schema (Alchemy Schema)
- `this.tools_class` - Parent collection class
- `this.class_name` - Parent collection class name (string)
- `this.permission` - Required permission (if any)
- `this.requires` - Requirement config (if any)
- `this.auto_callable` - Whether auto-callable

### McpSession Class

Each MCP session is an instance of `Thoth.Mcp.Session`. Sessions track state across multiple requests from the same client.

**Properties:**
- `tool_history` - Map of tool name → call info (total_calls, calls_since_last, timestamps)
- `queued_injections` - Array of pending messages to inject into responses
- `custom_data` - Map for storing arbitrary session data
- `last_reminder_times` - Map tracking when reminders were last injected
- `last_trigger_times` - Map tracking when inject_reminder triggers last fired
- `created` - Timestamp when session was created
- `last_activity` - Timestamp of last activity
- `api_key` - Associated API key (if any)
- `user_id` - User ID from API key
- `user` - User document (when populated)
- `client_info` - Client metadata from initialization

**Methods:**

```javascript
// Tool history tracking
session.recordToolCall('tool_name');
session.hasCalledTool('tool_name');
session.hasCalledTool('tool_name', {max_calls_ago: 5, max_seconds_ago: 300});
session.getToolHistory('tool_name');  // Specific tool
session.getToolHistory();             // All history

// Injection queue (messages appended to tool responses)
session.queueInjection('Message', {priority: 'high', type: 'reminder'});
session.consumeInjections();          // Get and clear all
session.consumeInjections(true);      // Get and clear high priority only
session.formatInjections();           // Get formatted string

// Custom data storage
session.setData('key', value);
session.getData('key', defaultValue);
session.hasData('key');
session.deleteData('key');

// Activity tracking
session.touch();                      // Update last_activity
session.isExpired(timeout_ms);        // Check if session expired
session.getIdleSeconds();             // Seconds since last activity
```

**Accessing session in tools:**

```javascript
async function execute(conduit, params) {
    // Via conduit methods (preferred)
    conduit.recordToolCall('some_tool');
    conduit.hasCalledTool('init_session');
    conduit.setMcpData('key', value);
    
    // Direct session access (when needed)
    let session = conduit.mcp_session;
    session.getIdleSeconds();
}
```

**Session lifecycle:**
1. Created by McpManager when client sends `initialize` request
2. Stored in `manager.sessions` Map keyed by session ID
3. Attached to conduit as `conduit.mcp_session` for each request
4. Expires after `session_timeout` (default 1 hour) of inactivity
5. Can be recovered via sticky session feature (see above)

### ToolHistoryEntry Class

Each tool's call statistics are tracked via `Thoth.Mcp.ToolHistoryEntry` instances stored in `session.tool_history.by_tool`.

**Properties:**
- `call_count` - Number of times this tool has been called
- `last_called_at` - Timestamp of the last call (ms since epoch)
- `calls_since_last` - Number of other tool calls since this tool was last called

**Methods:**

```javascript
let entry = session.getOrCreateToolEntry('tool_name');

entry.recordCall();              // Record a call (increments count, updates timestamp)
entry.recordCall(timestamp);     // With custom timestamp
entry.incrementCallsSince();     // Increment calls_since_last (called when other tools run)
entry.hasBeenCalled();           // Returns true if call_count > 0
entry.wasCalledWithin(options);  // Check with constraints (max_calls_ago, max_seconds_ago)
entry.getSecondsSinceLastCall(); // Seconds since last call, or null if never called
entry.toJSON();                  // Plain object for serialization
```

**Why a separate class:**
- Centralizes the structure definition (avoids inline object creation)
- Provides methods for common operations (wasCalledWithin, recordCall)
- Enables proper serialization/deserialization via toJSON/restoreToolHistory
- Makes the code more maintainable and testable

## FAQ

**[Alchemy-Thoth] MCP parameter processing order**
Parameters go through two stages in `_executeToolCore()`:
1. `schema.process()` - Type coercion, validation, and defaults (uses Alchemy's Schema class)
2. `processLookups()` - Fetch documents for fields with `lookup` option

The schema supports callable defaults via `field.getDefault()`. Defaults apply when parameters are not present in the request.

**[Alchemy-Thoth] Callable defaults in MCP tool parameters**
Use `default: () => LocalDate.create()` for dynamic defaults. This uses Alchemy's built-in Schema default handling - the function is called by `field.getDefault()` during `schema.process()`. Static defaults like `default: true` also work.

```javascript
this.addParameter('date', 'LocalDate', {
    mcp_description: 'Date to check (defaults to today)',
    default: () => LocalDate.create(),
});
```

**[Alchemy-Thoth] Extending McpTool for project-specific features**
To add custom methods/properties to tools (like a `helpers` getter), create a custom tool class:

```javascript
// app/lib/mcp/01-my_tool.js
const MyTool = Function.inherits('Thoth.Mcp.Tool', 'MyNamespace.Mcp', function Tool(tools, name, options) {
    MyTool.super.call(this, tools, name, options);
});

MyTool.setProperty(function helpers() {
    return MyHelpers.getInstance();
});
```

Then override `addTool()` in a base Tools class to use your custom Tool:

```javascript
// app/lib/mcp/02-my_tools.js
const MyTools = Function.inherits('Thoth.Mcp.Tools', 'MyNamespace.Mcp', 'Tools');
MyTools.makeAbstractClass();

MyTools.setStatic(function addTool(name, options, schema_fn, execute_fn) {
    this.constitute(function() {
        let schema = alchemy.createSchema();
        let schema_context = { addParameter: (n, t, o) => schema.addField(n, t, o) };
        schema_fn.call(schema_context);
        options.execute_fn = execute_fn;
        options.schema = schema;
        let tool = new Classes.MyNamespace.Mcp.Tool(this, name, options);
        this.tools.set(name, tool);
    });
});
```

**[Alchemy-Thoth] Tool file numbering for load order**
Files in `app/lib/mcp/` are loaded in alphabetical order. Use numeric prefixes to ensure proper load order when classes depend on each other:
- `00-helpers.js` - Singleton helpers
- `01-custom_tool.js` - Custom Tool class (extends Thoth.Mcp.Tool)
- `02-custom_tools.js` - Custom Tools base (extends Thoth.Mcp.Tools, references Tool)
- `employee_tools.js` - Actual tool definitions (extends custom Tools)
