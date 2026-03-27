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
          const errors = [];
          let accountKey = null;

          try {
            const { MailServices } = ChromeUtils.importESModule(
              "resource:///modules/MailServices.sys.mjs"
            );

            // nsMsgAuthMethod: passwordCleartext=3, OAuth2=10
            // nsMsgSocketType: plain=0, STARTTLS=2, SSL=3
            const authMethod = config.authMethod || 10;

            // ── IMAP ──
            console.log(`[OSMail] Creating IMAP server: ${config.imapHost}:${config.imapPort}`);
            let inServer;
            try {
              inServer = MailServices.accounts.createIncomingServer(
                email,
                config.imapHost,
                "imap"
              );
              inServer.port = config.imapPort || 993;
              inServer.socketType = config.imapSocketType || 3;
              inServer.authMethod = authMethod;
              console.log(`[OSMail] IMAP server created: port=${inServer.port} socket=${inServer.socketType} auth=${inServer.authMethod}`);
            } catch (e) {
              errors.push("IMAP: " + e.message);
              console.error("[OSMail] IMAP creation failed:", e);
            }

            // ── Identity ──
            let identity;
            try {
              identity = MailServices.accounts.createIdentity();
              identity.email = email;
              console.log(`[OSMail] Identity created: ${email}`);
            } catch (e) {
              errors.push("Identity: " + e.message);
              console.error("[OSMail] Identity creation failed:", e);
            }

            // ── Account ──
            if (inServer && identity) {
              try {
                const account = MailServices.accounts.createAccount();
                account.incomingServer = inServer;
                account.addIdentity(identity);
                accountKey = account.key;
                console.log(`[OSMail] Account created: ${accountKey}`);

                try {
                  MailServices.accounts.defaultAccount = account;
                } catch (e) {
                  console.log("[OSMail] Could not set default account:", e.message);
                }
              } catch (e) {
                errors.push("Account: " + e.message);
                console.error("[OSMail] Account linking failed:", e);
              }
            }

            // ── SMTP ──
            console.log(`[OSMail] Creating SMTP server: ${config.smtpHost}:${config.smtpPort}`);
            try {
              const smtpServer = MailServices.outgoingServer.createServer("smtp");
              console.log(`[OSMail] SMTP server object created, key=${smtpServer.key}`);

              smtpServer.username = email;
              console.log(`[OSMail] SMTP username set: ${email}`);

              smtpServer.hostname = config.smtpHost;
              console.log(`[OSMail] SMTP hostname set: ${config.smtpHost}`);

              smtpServer.port = config.smtpPort || 587;
              console.log(`[OSMail] SMTP port set: ${smtpServer.port}`);

              smtpServer.socketType = config.smtpSocketType || 2;
              console.log(`[OSMail] SMTP socketType set: ${smtpServer.socketType}`);

              smtpServer.authMethod = authMethod;
              console.log(`[OSMail] SMTP authMethod set: ${smtpServer.authMethod}`);

              if (identity) {
                identity.smtpServerKey = smtpServer.key;
                console.log(`[OSMail] Identity linked to SMTP: ${smtpServer.key}`);
              }

              try {
                MailServices.outgoingServer.defaultServer = smtpServer;
              } catch (e) {
                console.log("[OSMail] Could not set default outgoing server:", e.message);
              }

              console.log(`[OSMail] SMTP server complete: host=${smtpServer.hostname} port=${smtpServer.port} auth=${smtpServer.authMethod} socket=${smtpServer.socketType}`);
            } catch (e) {
              errors.push("SMTP: " + e.message);
              console.error("[OSMail] SMTP creation failed:", e);
            }

            if (errors.length > 0) {
              console.warn("[OSMail] Account setup completed with errors:", errors);
              return { success: accountKey !== null, accountKey, errors };
            }

            console.log(`[OSMail] Mail account fully created for ${email}`);
            return { success: true, accountKey };
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

            // nsIAbManager.CARDDAV_DIRECTORY_TYPE = 102
            const CARDDAV_TYPE = 102;

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
