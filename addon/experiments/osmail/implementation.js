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
        // All config written via Services.prefs to avoid WrappedNative
        // errors when setting properties on XPCOM objects from experiments.
        async createMailAccount(email, config) {
          const errors = [];

          try {
            // nsMsgAuthMethod: passwordCleartext=3, OAuth2=10
            // nsMsgSocketType: plain=0, STARTTLS=2, SSL=3
            const authMethod = config.authMethod || 10;

            // ── Find next available keys ──
            const existingAccounts = Services.prefs.getCharPref("mail.accountmanager.accounts", "");
            const existingSmtp = Services.prefs.getCharPref("mail.smtpservers", "");

            let serverNum = 1;
            let serverKey;
            do {
              serverKey = `server${serverNum++}`;
            } while (Services.prefs.prefHasUserValue(`mail.server.${serverKey}.type`));

            let idNum = 1;
            let idKey;
            do {
              idKey = `id${idNum++}`;
            } while (Services.prefs.prefHasUserValue(`mail.identity.${idKey}.useremail`));

            let acctNum = 1;
            let acctKey;
            do {
              acctKey = `account${acctNum++}`;
            } while (Services.prefs.prefHasUserValue(`mail.account.${acctKey}.server`));

            let smtpNum = 1;
            let smtpKey;
            do {
              smtpKey = `smtp${smtpNum++}`;
            } while (existingSmtp.includes(smtpKey));

            // ── IMAP Server ──
            console.log(`[OSMail] Creating IMAP: ${serverKey} -> ${config.imapHost}:${config.imapPort}`);
            try {
              const sp = `mail.server.${serverKey}`;
              Services.prefs.setCharPref(`${sp}.type`, "imap");
              Services.prefs.setCharPref(`${sp}.hostname`, config.imapHost);
              Services.prefs.setIntPref(`${sp}.port`, config.imapPort || 993);
              Services.prefs.setCharPref(`${sp}.userName`, email);
              Services.prefs.setIntPref(`${sp}.socketType`, config.imapSocketType || 3);
              Services.prefs.setIntPref(`${sp}.authMethod`, authMethod);
              Services.prefs.setCharPref(`${sp}.name`, "OSMail");
              console.log(`[OSMail] IMAP server prefs written: ${serverKey}`);
            } catch (e) {
              errors.push("IMAP: " + e.message);
              console.error("[OSMail] IMAP pref write failed:", e);
            }

            // ── Identity ──
            console.log(`[OSMail] Creating identity: ${idKey} -> ${email}`);
            try {
              const ip = `mail.identity.${idKey}`;
              Services.prefs.setCharPref(`${ip}.useremail`, email);
              Services.prefs.setCharPref(`${ip}.smtpServer`, smtpKey);
              Services.prefs.setBoolPref(`${ip}.valid`, true);
              console.log(`[OSMail] Identity prefs written: ${idKey}`);
            } catch (e) {
              errors.push("Identity: " + e.message);
              console.error("[OSMail] Identity pref write failed:", e);
            }

            // ── Account ──
            console.log(`[OSMail] Creating account: ${acctKey}`);
            try {
              const ap = `mail.account.${acctKey}`;
              Services.prefs.setCharPref(`${ap}.server`, serverKey);
              Services.prefs.setCharPref(`${ap}.identities`, idKey);

              // Register account
              const newAccounts = existingAccounts ? `${existingAccounts},${acctKey}` : acctKey;
              Services.prefs.setCharPref("mail.accountmanager.accounts", newAccounts);

              // Set as default
              Services.prefs.setCharPref("mail.accountmanager.defaultaccount", acctKey);

              // Make TB open this account's inbox on startup
              Services.prefs.setCharPref(`mail.server.${serverKey}.check_new_mail`, "true");
              Services.prefs.setBoolPref("mail.biff.on_new_window", true);
              console.log(`[OSMail] Account prefs written: ${acctKey}`);
            } catch (e) {
              errors.push("Account: " + e.message);
              console.error("[OSMail] Account pref write failed:", e);
            }

            // ── SMTP ──
            console.log(`[OSMail] Creating SMTP: ${smtpKey} -> ${config.smtpHost}:${config.smtpPort}`);
            try {
              const sp = `mail.smtpserver.${smtpKey}`;
              Services.prefs.setCharPref(`${sp}.type`, "smtp");
              Services.prefs.setCharPref(`${sp}.hostname`, config.smtpHost);
              Services.prefs.setIntPref(`${sp}.port`, config.smtpPort || 587);
              Services.prefs.setCharPref(`${sp}.username`, email);
              Services.prefs.setIntPref(`${sp}.try_ssl`, config.smtpSocketType || 2);
              Services.prefs.setIntPref(`${sp}.authMethod`, authMethod);
              Services.prefs.setCharPref(`${sp}.description`, "OSMail");

              const newSmtp = existingSmtp ? `${existingSmtp},${smtpKey}` : smtpKey;
              Services.prefs.setCharPref("mail.smtpservers", newSmtp);
              Services.prefs.setCharPref("mail.smtp.defaultserver", smtpKey);
              console.log(`[OSMail] SMTP prefs written: ${smtpKey}`);
            } catch (e) {
              errors.push("SMTP: " + e.message);
              console.error("[OSMail] SMTP pref write failed:", e);
            }

            if (errors.length > 0) {
              console.warn("[OSMail] Account setup had errors:", errors);
              return { success: errors.length < 4, errors };
            }

            console.log(`[OSMail] Mail account fully created: acct=${acctKey} server=${serverKey} id=${idKey} smtp=${smtpKey}`);
            return { success: true, accountKey: acctKey };
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
        },

        // ── Restart Thunderbird ───────────────────────────────────
        async restartApp() {
          try {
            const start = Services.startup;
            start.quit(start.eRestart | start.eAttemptQuit);
            return { success: true };
          } catch (e) {
            console.error("[OSMail] restart failed:", e);
            return { success: false, error: e.message };
          }
        }
      }
    };
  }
};
