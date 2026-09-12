# NovaMCP Windows Code Signing

NovaMCP release builds can be Authenticode-signed by electron-builder when a trusted Windows code-signing certificate is configured.

## Recommended release flow

1. Obtain a trusted code-signing certificate from a public CA. An OV or EV code-signing certificate can be used; EV generally builds SmartScreen reputation faster.
2. Store the certificate securely. Do not commit `.pfx`, private keys, passwords, or hardware-token credentials to the repository.
3. Configure signing credentials only in the release environment.

For a PFX certificate:

```powershell
$env:CSC_LINK = "C:\secure\NovaMCP-CodeSigning.pfx"
$env:CSC_KEY_PASSWORD = "<certificate password>"
npm run build:signed
```

For a certificate available through an appropriate signing provider/certificate store, configure the identity supported by electron-builder and use `npm run build:signed`.

`build:signed` intentionally stops before packaging when signing credentials are missing. Normal `npm run build:all` remains available for local/test builds and may be unsigned.

## Verify before publishing

```powershell
Get-AuthenticodeSignature .\release\NovaMCP-Setup-<version>-x64.exe | Format-List
Get-AuthenticodeSignature .\release\NovaMCP-Portable-<version>-x64.exe | Format-List
```

The expected status for a public signed build is `Valid` and the signer subject should match the certificate owner.

## Security rules

- Never upload a private signing key to GitHub Releases.
- Never commit certificate passwords or signing tokens.
- Keep release signing separate from normal development builds.
- Verify both Setup and Portable artifacts before publishing.
- SHA-256 checksums are useful for integrity, but they are not a replacement for Authenticode signing.
