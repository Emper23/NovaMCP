export const NOVAMCP_ABOUT = {
  name: "NovaMCP",
  description: "Desktop connector for ChatGPT, Roblox Studio and optional Desktop Control.",
  githubUrl: "https://github.com/Emper23/NovaMCP",
  releasesUrl: "https://github.com/Emper23/NovaMCP/releases/latest",
  sourcePolicyUrl: "https://github.com/Emper23/NovaMCP/blob/main/SOURCE_AVAILABLE.md",
  licenseLabel: "Partial source available · production backend remains private",
  changelog: [
    {
      version: "7.1.1",
      title: "Support page",
      changes: [
        "Added a dedicated สนับสนุนค่ากาแฟ page to the Control Center sidebar.",
        "Added a PromptPay support card using the original payment QR payload.",
        "Added server, Cloud Relay and development support information with voluntary-support wording."
      ]
    },
    {
      version: "7.1.0",
      title: "Control Center & onboarding",
      changes: [
        "Rebuilt the Dashboard with a sidebar and dedicated Overview, Setup, Connections, Roblox, Security, Diagnostics, Updates and About pages.",
        "Added a first-run Setup Wizard with Roblox integration, ChatGPT pairing, connection tests and security defaults.",
        "Added Roblox Studio MCP detection, Studio version status, launcher synchronization, Repair MCP Integration and Open Studio actions.",
        "Added Diagnostics ZIP export with automatic token, pairing-code, credential and common user-path redaction.",
        "Added Code Signing status plus a guarded build:signed release workflow that refuses to pretend an unsigned build is signed."
      ]
    },
    {
      version: "7.0.4",
      title: "Silent in-app updates",
      changes: [
        "In-app updates now install silently without showing the NSIS installer window.",
        "NovaMCP closes, installs the downloaded update in the background and launches again automatically.",
        "Manual Setup installers still keep the normal installation UI for first-time installs."
      ]
    },
    {
      version: "7.0.3",
      title: "About & Changelog",
      changes: [
        "Added About & Changelog directly to the NovaMCP Dashboard.",
        "Added What’s New with version-aware release information.",
        "Added quick links for GitHub, Latest Release and source/license policy.",
        "Added release history for recent NovaMCP versions."
      ]
    },
    {
      version: "7.0.2",
      title: "In-app updater",
      changes: [
        "Added update checks from GitHub Releases.",
        "Setup edition can download updates and Restart & Install from the Dashboard.",
        "Portable edition can detect new releases and open the latest download.",
        "Added download progress, latest.yml and blockmap support."
      ]
    },
    {
      version: "7.0.1",
      title: "Dashboard & reliability",
      changes: [
        "Improved Dashboard connection status and diagnostics.",
        "Added pairing-code regeneration and cloud-token revoke controls.",
        "Moved per-user configuration into %APPDATA%\\NovaMCP.",
        "Improved dashboard-port conflict handling and Desktop Control safety."
      ]
    }
  ]
};

export function getAboutInfo(currentVersion, updateState = {}) {
  const current = NOVAMCP_ABOUT.changelog.find(item => item.version === currentVersion) || NOVAMCP_ABOUT.changelog[0];
  return {
    ...NOVAMCP_ABOUT,
    currentVersion,
    latestVersion: updateState.latestVersion || currentVersion,
    whatsNew: current,
    changelog: NOVAMCP_ABOUT.changelog
  };
}
