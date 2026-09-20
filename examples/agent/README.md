# Modern MCP Forge — Agent Demo

This example is deliberately separate from the Forge runtime.

Forge remains framework-neutral.

The demo agent is an independent MCP consumer built with:

- Strands Agents TypeScript
- Strands MCP client
- Vercel AI SDK model adapter
- Anthropic or Ollama provider profiles

## Architecture

```text
User prompt
    |
    v
Strands Agent
    |
    +--> selected model provider
    |
    v
MCP Client
    |
    v
http://localhost:5173/mcp
    |
    v
Modern MCP Forge
    |
    +--> Bun
    +--> Node.js
    +--> Python
    |
    v
tool result
    |
    v
Strands Agent
    |
    v
final answer
```

## Provider profiles

Configuration lives in:

```text
examples/agent/agent.config.json
```

This file contains **no secrets**.

A profile contains:

- provider
- model
- optional base URL
- environment-variable name for the API key
- temperature
- max tokens
- top-p

Secrets remain in the process environment.

## List profiles

```bash
bun run agent:profiles
```

Expected:

```text
* anthropic          anthropic  claude-sonnet-4-6
  ollama-local       ollama     llama3.1
```

## Anthropic

Set the secret in your shell.

Git Bash:

```bash
export ANTHROPIC_API_KEY="your-key"
```

PowerShell:

```powershell
$env:ANTHROPIC_API_KEY="your-key"
```

Start Forge in another terminal:

```bash
bun --bun run dev
```

Then:

```bash
bun run agent:demo -- --profile anthropic
```

Use a prompt that matches the tools exposed by the currently active Forge project.

For a one-shot run:

```bash
bun run agent:demo -- --profile anthropic --prompt "Use the available Forge tools to complete this task."
```

## Ollama with Docker

Start Ollama:

```bash
bun run agent:ollama:up
```

Pull the default demo model:

```bash
docker exec -it modern-mcp-forge-ollama ollama pull llama3.1
```

Verify:

```bash
curl http://localhost:11434/api/tags
```

Then:

```bash
bun run agent:demo -- --profile ollama-local
```

No API key is required for the local profile.

### GPU note

The included Compose file is intentionally portable and does not require a GPU.

If Docker GPU support is configured on the host, update the Compose service to expose the GPU to Ollama.

## Native Ollama

The Docker container is optional.

If Ollama is installed directly on the machine:

```bash
ollama pull llama3.1
ollama serve
```

then the same `ollama-local` profile works because it connects to:

```text
http://localhost:11434
```

## Choosing another local model

Edit only the profile:

```json
{
  "provider": "ollama",
  "model": "qwen3",
  "baseUrl": "http://localhost:11434"
}
```

The chosen model must support tool/function calling for the Forge agent test to work correctly.

## Adding providers later

The example intentionally has a small Forge-owned provider factory:

```text
examples/agent/model-provider.ts
```

Adding another provider consists of:

1. install its Vercel AI SDK provider package
2. add a profile type
3. add one factory branch

Examples that can be added later include:

- OpenAI
- Google Gemini
- AWS Bedrock
- Azure OpenAI
- OpenRouter
- Groq
- xAI
- Mistral

The Strands agent loop and MCP integration do not change.

## Custom config

Use another tracked or local config:

```bash
bun run agent:demo -- --config ./my-agent-config.json --profile my-profile
```

## Safety / secret handling

Do not put API key values into `agent.config.json`.

The tracked profile should contain only:

```json
{
  "apiKeyEnv": "ANTHROPIC_API_KEY"
}
```

The real value belongs in the process environment or the user's normal secret-management mechanism.

## What to verify in Forge

After an agent run, open:

```text
http://localhost:5173/executions
```

Any tools the model selected should appear in the same execution history as:

- Workbench tests
- MCP smoke tests
- other MCP clients

That is the important end-to-end proof.
