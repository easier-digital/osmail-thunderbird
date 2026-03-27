/* globals ExtensionAPI, ChromeUtils, Ci, Services */
"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);

var osmail = class extends ExtensionAPI {
  getAPI(context) {
    return {
      osmail: {

        // ── OAuth2 Provider Registration ──────────────────────────
        async registerOAuthProvider(config) {
          try {
            const { OAuth2Providers } = ChromeUtils.importESModule(
              "resource:///modules/OAuth2Providers.sys.mjs"
            );

            const hostnames = config.hostnames || [];
            const scopes = config.scopes || "openid email profile";
            const usePkce = config.usePkce !== undefined ? config.usePkce : true;

            // Unregister first if already registered
            try {
              OAuth2Providers.unregisterProvider(config.issuer);
            } catch (e) {
              // Not registered yet, that's fine
            }

            OAuth2Providers.registerProvider(
              config.issuer,
              config.clientId,
              config.clientSecret || "",
              config.authorizationEndpoint,
              config.tokenEndpoint,
              config.redirectUri || "https://localhost",
              usePkce,
              hostnames,
              scopes
            );

            console.log(`[OSMail] OAuth provider registered: ${config.issuer} for [${hostnames}]`);
            return { success: true };
          } catch (e) {
            console.error("[OSMail] registerOAuthProvider failed:", e);
            return { success: false, error: e.message };
          }
        },

        // ── Mail Account Creation ─────────────────────────────────
        async createMailAccount(email, config) {
          try {
            const { MailServices } = ChromeUtils.importESModule(
              "resource:///modules/MailServices.sys.mjs"
            );

            // nsMsgAuthMethod.OAuth2 = 10
            const authMethod = config.authMethod || 10;

            // Create incoming IMAP server
            const inServer = MailServices.accounts.createIncomingServer(
              email,
              config.imapHost,
              "imap"
            );
            inServer.port = config.imapPort || 993;
            inServer.socketType = config.imapSocketType || 3; // SSL
            inServer.authMethod = authMethod;
            inServer.prettyName = "OSMail";

            // Create identity
            const identity = MailServices.accounts.createIdentity();
            identity.email = email;
            identity.fullName = "";

            // Create account
            const account = MailServices.accounts.createAccount();
            account.incomingServer = inServer;
            account.addIdentity(identity);

            // Set as default if it's the first account
            if (MailServices.accounts.accounts.length === 1) {
              MailServices.accounts.defaultAccount = account;
            }

            // Create SMTP server
            const smtpServer = MailServices.smtp.createServer();
            smtpServer.hostname = config.smtpHost;
            smtpServer.port = config.smtpPort || 587;
            smtpServer.socketType = config.smtpSocketType || 2; // STARTTLS
            smtpServer.authMethod = authMethod;
            smtpServer.username = email;
            smtpServer.description = "OSMail SMTP";

            // Link identity to SMTP server
            identity.smtpServerKey = smtpServer.key;

            // Set as default SMTP if first
            if (!MailServices.smtp.defaultServer) {
              MailServices.smtp.defaultServer = smtpServer;
            }

            console.log(`[OSMail] Mail account created for ${email}`);
            return { success: true, accountKey: account.key };
          } catch (e) {
            console.error("[OSMail] createMailAccount failed:", e);
            return { success: false, error: e.message };
          }
        },

        // ── CalDAV Calendar ───────────────────────────────────────
        async createCalDAV(name, url, username, color) {
          try {
            const { cal } = ChromeUtils.importESModule(
              "resource:///modules/calendar/calUtils.sys.mjs"
            );

            const calMgr = cal.manager;
            const uri = Services.io.newURI(url);
            const calendar = calMgr.createCalendar("caldav", uri);
            calendar.name = name;
            calendar.setProperty("username", username);
            calendar.setProperty("color", color || "#7C3AED");
            calendar.setProperty("calendar-main-default", true);
            calendar.setProperty("cache.enabled", true);

            calMgr.registerCalendar(calendar);

            console.log(`[OSMail] CalDAV calendar created: ${name} at ${url}`);
            return { success: true, calendarId: calendar.id };
          } catch (e) {
            console.error("[OSMail] createCalDAV failed:", e);
            return { success: false, error: e.message };
          }
        },

        // ── CardDAV Address Book ──────────────────────────────────
        async createCardDAV(name, url, username) {
          try {
            const { MailServices } = ChromeUtils.importESModule(
              "resource:///modules/MailServices.sys.mjs"
            );

            // nsIAbManager.CARDDAV_DIRECTORY_TYPE = 104
            const CARDDAV_TYPE = 104;

            const dirPrefId = MailServices.ab.newAddressBook(
              name,
              "",
              CARDDAV_TYPE
            );

            const book = MailServices.ab.getDirectoryFromId(dirPrefId);
            book.setStringValue("carddav.url", url);
            book.setStringValue("carddav.username", username);

            // Trigger initial sync
            try {
              book.fetchAllFromServer();
            } catch (e) {
              // May fail if not yet authenticated, that's ok
              console.log("[OSMail] CardDAV initial sync deferred (auth pending)");
            }

            console.log(`[OSMail] CardDAV address book created: ${name} at ${url}`);
            return { success: true, dirPrefId };
          } catch (e) {
            console.error("[OSMail] createCardDAV failed:", e);
            return { success: false, error: e.message };
          }
        },

        // ── Account Count ─────────────────────────────────────────
        async getAccountCount() {
          try {
            const { MailServices } = ChromeUtils.importESModule(
              "resource:///modules/MailServices.sys.mjs"
            );
            // Filter out Local Folders
            let count = 0;
            for (const account of MailServices.accounts.accounts) {
              if (account.incomingServer && account.incomingServer.type !== "none") {
                count++;
              }
            }
            return count;
          } catch (e) {
            return 0;
          }
        }
      }
    };
  }
};
