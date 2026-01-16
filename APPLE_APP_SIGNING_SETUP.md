# Apple App Signing Setup Guide

This guide explains how to set up code signing for macOS and iOS builds in the GitHub Actions CI pipeline.

## Overview

The release workflow now supports:
- **Signed macOS builds** with notarization for App Store or Developer ID distribution
- **Signed iOS builds** for App Store distribution
- **Unsigned builds** as fallback when secrets are not configured

## Prerequisites

1. **Apple Developer Account** ($99/year) - https://developer.apple.com/programs/
2. **Temporary access to a Mac** for certificate generation and export
3. **GitHub repository** with Actions enabled

## Required GitHub Secrets

Configure these secrets in: `Settings → Secrets and variables → Actions → New repository secret`

### For macOS App Signing

| Secret Name | Description | Example |
|------------|-------------|---------|
| `APPLE_CERTIFICATE` | Base64-encoded .p12 certificate | `MIIKfAIBAzCCChoGCSq...` |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 file | `your-strong-password` |
| `APPLE_SIGNING_IDENTITY` | Full certificate name | `Apple Distribution: Your Company (ABC123XYZ)` |
| `APPLE_TEAM_ID` | 10-character Apple Team ID | `ABC123XYZ` |

### For macOS Notarization (Choose ONE method)

**Option 1: App Store Connect API Key (Recommended)**

| Secret Name | Description | Where to Find |
|------------|-------------|---------------|
| `APPLE_API_ISSUER` | Issuer ID (UUID format) | App Store Connect → Users and Access → Keys (top of page) |
| `APPLE_API_KEY` | Key ID | App Store Connect → Users and Access → Keys → Key ID column |
| `APPLE_API_KEY_P8` | Contents of .p8 file | Paste entire contents of downloaded .p8 file |

**Option 2: Apple ID Authentication (Alternative)**

| Secret Name | Description | Where to Get |
|------------|-------------|--------------|
| `APPLE_ID` | Your Apple ID email | Your Apple ID account |
| `APPLE_PASSWORD` | App-specific password | https://appleid.apple.com → App-Specific Passwords |

### For iOS App Signing

| Secret Name | Description | Example |
|------------|-------------|---------|
| `APPLE_DEVELOPMENT_TEAM` | Your 10-character Team ID (same as `APPLE_TEAM_ID`) | `ABC123XYZ` |
| `IOS_MOBILE_PROVISION` | Base64-encoded provisioning profile | `MIIOkQYJKoZIhvcNAQ...` |

**Note**: iOS uses the same `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD` as macOS.

## Step-by-Step Setup

### 1. Create Apple Developer Account

1. Go to https://developer.apple.com/programs/enroll/
2. Enroll in the Apple Developer Program ($99/year)
3. Wait for approval (24-48 hours typically)
4. Once approved, note your **Team ID** from Membership details

### 2. Create App Store Connect API Key (Recommended)

1. Sign in to https://appstoreconnect.apple.com
2. Navigate to **Users and Access** → **Keys** tab
3. Click **+** to generate a new API Key
4. Name: "GitHub Actions" (or similar)
5. Role: **Developer** (minimum required)
6. Click **Generate**
7. **CRITICAL**: Download the `.p8` file immediately (only one chance!)
8. Note the **Key ID** (e.g., "ABC123XYZ")
9. Note the **Issuer ID** (UUID at top of Keys page)

### 3. Create Apple Distribution Certificate (On Your Mac)

#### Generate Certificate Signing Request:
```bash
# Option 1: Using Keychain Access GUI
# 1. Open Keychain Access
# 2. Menu: Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority
# 3. Enter email and name
# 4. Select "Saved to disk"
# 5. Save CertificateSigningRequest.certSigningRequest
```

#### Create Certificate in Apple Developer Portal:
1. Go to https://developer.apple.com/account/resources/certificates
2. Click **+** to create new certificate
3. Select **"Apple Distribution"** under Software
4. Upload your CSR file
5. Download the certificate file
6. Double-click to install in your Mac's Keychain

### 4. Register App IDs

1. Go to https://developer.apple.com/account/resources/identifiers
2. Click **+** → **App IDs** → **App**
3. Description: "DMX Controller App"
4. Bundle ID: `app.dmx-controller` (explicit, not wildcard)
5. Select required capabilities (e.g., Network)
6. Click **Register**

**Note**: You can use the same Bundle ID for both iOS and macOS, or create separate ones.

### 5. Create Provisioning Profiles

#### For macOS:
1. Go to https://developer.apple.com/account/resources/profiles
2. Click **+** → **"Mac App Store"** (under Distribution)
3. Select your macOS App ID
4. Select your Apple Distribution certificate
5. Name: "DMX Controller macOS App Store"
6. Download the `.provisionprofile` file

#### For iOS:
1. Click **+** → **"App Store Connect"** (under Distribution)
2. Select your iOS App ID
3. Select your Apple Distribution certificate
4. Name: "DMX Controller iOS App Store"
5. Download the `.mobileprovision` file

### 6. Export Certificate with Modern Encryption

The default export from macOS Keychain uses RC2 cipher, which isn't supported by modern OpenSSL. You need to re-export with modern encryption.

```bash
# Step 1: Export from Keychain Access
# - Open Keychain Access
# - Select "My Certificates" in sidebar
# - Find "Apple Distribution: Your Name (TEAMID)"
# - Right-click → Export "Apple Distribution: ..."
# - File Format: Personal Information Exchange (.p12)
# - Save as "distribution_original.p12"
# - Enter a strong password

# Step 2: Re-encrypt with modern cipher (run in Terminal)
cd ~/Downloads  # Or wherever you saved the .p12

# Extract certificate and key (requires legacy OpenSSL support on macOS)
openssl pkcs12 -in distribution_original.p12 -nodes -out temp.pem -legacy

# Re-package with modern 3DES encryption
openssl pkcs12 -export -in temp.pem -out distribution_fixed.p12 -legacy
# Enter a NEW strong password (save this for GitHub Secrets!)

# Clean up sensitive temporary files
rm temp.pem
rm distribution_original.p12

# Verify the fixed certificate works
openssl pkcs12 -in distribution_fixed.p12 -nokeys -clcerts
# You should see your certificate details without errors
```

### 7. Convert to Base64 for GitHub Secrets

```bash
# Convert certificate to base64
base64 -i distribution_fixed.p12 | pbcopy
# The base64 string is now in your clipboard
# Paste this into GitHub Secrets as APPLE_CERTIFICATE

# Convert iOS provisioning profile to base64
base64 -i ~/Downloads/YourProfile.mobileprovision | pbcopy
# Paste this into GitHub Secrets as IOS_MOBILE_PROVISION

# For API key .p8 file
cat ~/Downloads/AuthKey_ABC123XYZ.p8 | pbcopy
# Paste the entire contents into GitHub Secrets as APPLE_API_KEY_P8
```

### 8. Find Your Signing Identity Name

```bash
# List all code signing identities in your keychain
security find-identity -v -p codesigning

# Look for output like:
# 1) ABC123... "Apple Distribution: Your Company Name (ABC123XYZ)"

# Copy the EXACT text in quotes (including the quotes)
# This is your APPLE_SIGNING_IDENTITY
```

### 9. Create App-Specific Password (If Using Apple ID Authentication)

1. Go to https://appleid.apple.com
2. Sign in with your Apple ID
3. Navigate to **Sign-In and Security**
4. Click **App-Specific Passwords**
5. Click **+** to generate new password
6. Label: "GitHub Actions DMX Controller"
7. Copy the password (format: `xxxx-xxxx-xxxx-xxxx`)
8. Save as `APPLE_PASSWORD` in GitHub Secrets

### 10. Configure GitHub Secrets

Go to your repository on GitHub:
1. Click **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add each secret from the tables above

**Minimum Required Secrets:**
```
APPLE_CERTIFICATE (base64 .p12)
APPLE_CERTIFICATE_PASSWORD (password for .p12)
APPLE_SIGNING_IDENTITY (e.g., "Apple Distribution: Company (TEAMID)")
APPLE_TEAM_ID (10-char Team ID)
APPLE_DEVELOPMENT_TEAM (same as APPLE_TEAM_ID)
```

**Plus ONE of these notarization methods:**

**API Key Method (recommended):**
```
APPLE_API_ISSUER
APPLE_API_KEY
APPLE_API_KEY_P8
```

**Apple ID Method (alternative):**
```
APPLE_ID
APPLE_PASSWORD
```

**Optional for iOS:**
```
IOS_MOBILE_PROVISION (base64 provisioning profile)
```

## How It Works

### macOS Build Process

1. **Without Secrets**: Builds unsigned universal DMG (Intel + Apple Silicon)
2. **With Secrets**:
   - Imports certificate into temporary keychain
   - Builds signed universal binary for both architectures
   - Tauri automatically signs the app bundle
   - Tauri automatically notarizes with Apple (using API key or Apple ID)
   - Tauri automatically staples notarization ticket to app
   - Creates signed DMG for distribution
   - Cleans up temporary keychain

### iOS Build Process

1. **Without Secrets**: Builds unsigned IPA for debugging only
2. **With Secrets**:
   - Imports certificate and provisioning profile
   - Builds signed IPA for App Store distribution
   - Ready for upload to App Store Connect
   - Cleans up temporary keychain

## Testing the Setup

### Test Locally (Optional)

Before pushing to CI, you can test signing locally on your Mac:

```bash
# Set environment variables (use your actual values)
export APPLE_SIGNING_IDENTITY="Apple Distribution: Your Company (ABC123XYZ)"
export APPLE_TEAM_ID="ABC123XYZ"
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"

# Test macOS build
pnpm tauri build --bundles dmg --target universal-apple-darwin

# Test iOS build
pnpm tauri ios init
export APPLE_DEVELOPMENT_TEAM="ABC123XYZ"
pnpm tauri ios build --export-method app-store
```

### Test in CI

1. Commit your changes to the `claude/setup-app-signing-Ofkso` branch
2. Either:
   - **Option A**: Update version in `src-tauri/tauri.conf.json` and push to trigger build
   - **Option B**: Go to Actions tab → "Build and Release" → "Run workflow"
3. Monitor the workflow run for any errors
4. Check that signed artifacts are uploaded

## Troubleshooting

### Common Issues

**"No identity found" error:**
- Verify `APPLE_SIGNING_IDENTITY` exactly matches the output of `security find-identity -v -p codesigning`
- Ensure certificate was imported into the temporary keychain correctly

**"Certificate has expired" error:**
- Apple Distribution certificates expire after 1 year
- Create a new certificate in Apple Developer Portal
- Re-export and update GitHub Secrets

**"RC2 cipher not supported" error:**
- Your .p12 uses old encryption
- Follow Step 6 again to re-export with modern encryption

**Notarization timeout:**
- Apple's notarization service can be slow (5-30 minutes typical)
- GitHub Actions timeout is set to allow for this
- Check status at https://developer.apple.com/help/account/manage-notarizations

**Provisioning profile issues (iOS):**
- Ensure profile matches Bundle ID exactly
- Ensure profile includes your Distribution certificate
- Regenerate profile if you renewed your certificate

### Validation Commands

Run these on your Mac to verify setup:

```bash
# Verify certificate is installed
security find-identity -v -p codesigning

# Verify provisioning profile
security cms -D -i ~/Library/MobileDevice/Provisioning\ Profiles/profile.mobileprovision

# Verify app signature (after building)
codesign -dvv /path/to/DMX\ Controller\ App.app

# Verify notarization (after building)
spctl -a -vv /path/to/DMX\ Controller\ App.app
```

## Certificate Renewal

Apple Distribution certificates expire after **1 year**. Set a calendar reminder!

**Renewal Process:**
1. Create new certificate in Apple Developer Portal (same process as initial setup)
2. Download and install new certificate
3. Export new certificate following Step 6
4. Update GitHub Secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`
5. Update provisioning profiles in Apple Developer Portal to use new certificate
6. Re-download and convert provisioning profiles to base64
7. Update `IOS_MOBILE_PROVISION` secret if needed

## Security Best Practices

- ✅ Never commit `.p12` files or passwords to git
- ✅ Use strong, unique passwords for .p12 files
- ✅ Rotate App Store Connect API keys annually
- ✅ Use API key authentication instead of Apple ID when possible
- ✅ Limit API key permissions to minimum required (Developer role)
- ✅ Keep backup of .p8 API key file in secure location (can only download once!)
- ✅ Set calendar reminders for certificate expiration
- ❌ Don't share certificates between team members (each should have their own)
- ❌ Don't use your main Apple ID password (always use app-specific passwords)

## Submitting to App Store

Once you have signed builds:

### macOS App Store Submission

1. Create app listing in App Store Connect
2. Use Transporter app or `xcrun altool` to upload the signed DMG or .pkg
3. Complete app metadata in App Store Connect
4. Submit for review

### iOS App Store Submission

1. Create app listing in App Store Connect
2. Upload IPA:
   ```bash
   xcrun altool --upload-app \
     --type ios \
     --file "path/to/app.ipa" \
     --apiKey "YOUR_KEY_ID" \
     --apiIssuer "YOUR_ISSUER_ID"
   ```
3. Complete app metadata and screenshots
4. Submit for review

## References

- [Tauri macOS Code Signing](https://v2.tauri.app/distribute/sign/macos/)
- [Tauri iOS Code Signing](https://v2.tauri.app/distribute/sign/ios/)
- [Apple Developer Documentation](https://developer.apple.com/documentation/)
- [App Store Connect API Keys](https://appstoreconnect.apple.com/access/api)
- [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)

---

**Last Updated**: 2026-01-16
**Tauri Version**: v2
**Tested on**: macOS Sonoma 14.x, GitHub Actions Ubuntu/macOS runners
