# NovaMCP 7.1.0

## Control Center & onboarding

- Rebuilt the Dashboard with a sidebar and dedicated pages for Overview, Setup, Connections, Roblox, Security, Diagnostics, Updates and About.
- Added a first-run Setup Wizard for Roblox MCP, ChatGPT pairing, connection tests and security defaults.
- Added Roblox Studio / StudioMCP detection, version status, launcher synchronization, Repair MCP Integration and Open Studio actions.
- Added shareable Diagnostics ZIP export with automatic token, pairing-code, credential and common user-path redaction.
- Added Code Signing status and a guarded `npm run build:signed` workflow.
- Fixed MCP server/client version reporting so it follows the actual NovaMCP package version instead of the old hard-coded 7.0.0.

### Code signing note
Public builds remain unsigned until a trusted Windows code-signing certificate is provisioned. The signed-build workflow now refuses to continue without signing credentials instead of silently producing an unsigned artifact.
