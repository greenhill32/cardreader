# DCS Card Reader

Local-only, read-only Web NFC PWA. Reads Android Web NFC `NDEFReader` `serialNumber`, validates a **4-byte UID**, and calculates:

- `extensionAttribute5`: `DataView.getUint32(0, true)` (little-endian)
- `extensionAttribute6`: uppercase colon-separated original UID bytes

Matches the conversions in `Card-Scan-Clipboard.ps1.txt`. Unlike the PowerShell script it **does not connect to Active Directory or change anything**. Clipboard and last 30 scans are local to the phone. Clearing browser site data clears history. History is not encrypted; avoid use on shared/unmanaged devices if card IDs are sensitive.

## IIS deployment

1. Copy all files in this folder to an IIS site or application, e.g. `C:\inetpub\wwwroot\dcs-card-reader\`.
2. Set up HTTPS using a certificate trusted by the Android device. Redirect HTTP to HTTPS at the reverse proxy/IIS if required.
3. Keep `web.config` with the files for MIME types and headers. If IIS rejects duplicate configuration entries or MIME types, resolve conflicts at the site configuration level.
4. Open the URL in **Chrome for Android**, turn on NFC, grant requested permission, tap **Start scanning**, hold a supported tag to the phone. Use Chrome **Add to Home screen / Install app** to install.
5. If updating files, increment `CACHE` in `service-worker.js` before redeployment to force refresh of cached files.

## Constraints and tests

Web NFC requires a secure context, an Android browser that supports `NDEFReader`, and a compatible NFC tag. **Web NFC cannot issue the PC/SC `FF CA` command used by the Windows script and may not detect some access cards**. Even if the phone's hardware reads the card, the Web NFC API may not provide its UID. It must be tested against your actual DCS card and Windows reader. A different UID ordering cannot be inferred from Web NFC alone: verify with a known card before operational use.

Example UID `01:02:03:04` => attribute5 `67305985`, attribute6 `01:02:03:04`.
Example UID `FF:FF:FF:FF` => attribute5 `4294967295`, attribute6 `FF:FF:FF:FF`.
Example UID `12:34:56:78` => attribute5 `2018915346`, attribute6 `12:34:56:78`.
Seven-byte UIDs are intentionally rejected. Repeated reads of the same card within two seconds are deduplicated.

No dependencies, no external API calls, no analytics, no user accounts. Offline shell is cached; NFC capability still depends on browser/hardware behavior.
