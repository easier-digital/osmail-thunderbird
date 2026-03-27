"use strict";

const CONFIG_URL = browser.runtime.getURL("config.json");

async function loadConfig() {
  const resp = await fetch(CONFIG_URL);
  return resp.json();
}

async function registerOAuth(config) {
  const hostnames = config.hostname.split(/[\s,]+/).filter(Boolean);
  const imap = config.scopes?.imap || "openid email profile";
  const smtp = config.scopes?.smtp || "openid email profile";
  const scopeSet = new Set([...imap.split(" "), ...smtp.split(" ")]);
  const mergedScopes = [...scopeSet].join(" ");

  return browser.osmail.registerOAuthProvider({
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret || "",
    authorizationEndpoint: config.authorizationEndpoint,
    tokenEndpoint: config.tokenEndpoint,
    redirectUri: config.redirectUri || "https://localhost",
    usePkce: config.usePkce !== undefined ? config.usePkce : true,
    hostnames,
    scopes: mergedScopes
  });
}

async function init() {
  console.log("[OSMail] background loaded");

  // Always register OAuth provider on startup
  try {
    const config = await loadConfig();
    const result = await registerOAuth(config);
    console.log("[OSMail] OAuth registration:", result.success ? "OK" : result.error);
  } catch (e) {
    console.error("[OSMail] OAuth registration failed:", e);
  }

  // Check if onboarding is needed
  const accountCount = await browser.osmail.getAccountCount();
  const storage = await browser.storage.local.get("onboardingComplete");

  if (accountCount === 0 && !storage.onboardingComplete) {
    console.log("[OSMail] No accounts found, opening onboarding wizard");
    browser.tabs.create({ url: "onboarding/index.html" });
  }
}

// Listen for messages from the onboarding page
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === "setup") {
    return handleSetup(message.email);
  }
  if (message.action === "checkStatus") {
    const count = await browser.osmail.getAccountCount();
    return { hasAccount: count > 0 };
  }
});

async function handleSetup(email) {
  const config = await loadConfig();
  const results = { email, steps: {} };

  // 1. Create mail account (OAuth2 auth = 10)
  const mailResult = await browser.osmail.createMailAccount(email, {
    imapHost: config.imap.hostname,
    imapPort: config.imap.port,
    imapSocketType: config.imap.socketType,
    smtpHost: config.smtp.hostname,
    smtpPort: config.smtp.port,
    smtpSocketType: config.smtp.socketType,
    authMethod: 10
  });
  results.steps.mail = mailResult;

  // 2. Create CalDAV calendar
  const username = email;
  const calUrl = `${config.caldav.baseUrl}/calendars/${username}/personal/`;
  const calResult = await browser.osmail.createCalDAV(
    "OSMail Calendar",
    calUrl,
    username,
    "#7C3AED"
  );
  results.steps.calendar = calResult;

  // 3. Create CardDAV address book
  const cardUrl = `${config.carddav.baseUrl}/addressbooks/users/${username}/contacts/`;
  const cardResult = await browser.osmail.createCardDAV(
    "OSMail Contacts",
    cardUrl,
    username
  );
  results.steps.contacts = cardResult;

  // Mark onboarding complete
  if (mailResult.success) {
    await browser.storage.local.set({ onboardingComplete: true });
  }

  results.success = mailResult.success;
  return results;
}

init();
