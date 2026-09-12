export const NOVAMCP_ABOUT = {
  name: "NovaMCP",
  description: "Desktop connector for ChatGPT, Roblox Studio and optional Desktop Control.",
  githubUrl: "https://github.com/Emper23/NovaMCP",
  releasesUrl: "https://github.com/Emper23/NovaMCP/releases/latest",
  sourcePolicyUrl: "https://github.com/Emper23/NovaMCP/blob/main/SOURCE_AVAILABLE.md",
  licenseLabel: "Partial source available · production backend remains private",
  changelog: [
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
